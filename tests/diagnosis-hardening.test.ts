import { describe, expect, it, vi } from "vitest";
import { diagnoseWithClient } from "../lib/diagnose-server";
import {
  diagnosisForSelectedHypothesis,
  validateAndNormalizeDiagnosis,
} from "../lib/diagnosis";
import { confidenceBand } from "../components/DiagnosisCard";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const baseFixture = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: { id: "add_across", label: "Adding numerators and denominators directly" },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    {
      id: "careless_slip",
      label: "Careless slip (knows the method)",
      explanation: "The student may know the method but slipped once.",
    },
    {
      id: "misread_operation",
      label: "Misread the operation",
      explanation: "The student may have misread the sign.",
    },
  ],
  teacherCheckQuestion: "ignored — remapped from the library",
};

function clientReturning(payload: unknown) {
  return {
    responses: {
      create: vi.fn().mockResolvedValue({
        output_text: typeof payload === "string" ? payload : JSON.stringify(payload),
      }),
    },
  };
}

describe("confidenceBand boundaries", () => {
  it.each([
    [100, "High"],
    [80, "High"],
    [79, "Medium"],
    [60, "Medium"],
    [59, "Low"],
    [1, "Low"],
    [0, "Low"],
  ] as const)("maps %i to %s", (value, expected) => {
    expect(confidenceBand(value)).toBe(expected);
  });
});

describe("diagnoseWithClient with a stubbed client", () => {
  it("returns a low-confidence unreadable/careless-slip diagnosis intact", async () => {
    const fixture = {
      ...baseFixture,
      confidence: 22,
      evidence: ["final digit illegible"],
      alternatives: [
        {
          id: "unreadable_work",
          label: "Unreadable work",
          explanation: "The photo is too blurry to support a firm conclusion.",
        },
        {
          id: "careless_slip",
          label: "Careless slip (knows the method)",
          explanation: "Earlier lines use the correct method.",
        },
      ],
    };

    const diagnosis = await diagnoseWithClient(ONE_PIXEL_PNG, clientReturning(fixture));

    expect(diagnosis.confidence).toBe(22);
    expect(confidenceBand(diagnosis.confidence)).toBe("Low");
    expect(diagnosis.alternatives.map((a) => a.id)).toEqual([
      "unreadable_work",
      "careless_slip",
    ]);
    // Label and check-question always come from the fixed library, not the model.
    expect(diagnosis.primary.label).toBe("Adding numerators and denominators directly");
    expect(diagnosis.teacherCheckQuestion).toBe(
      "What does the denominator tell us about the size of each piece?",
    );
  });

  it("rejects non-JSON model output", async () => {
    await expect(
      diagnoseWithClient(ONE_PIXEL_PNG, clientReturning("not json {")),
    ).rejects.toThrow("invalid diagnosis JSON");
  });

  it("rejects an empty model response", async () => {
    const client = { responses: { create: vi.fn().mockResolvedValue({ output_text: "" }) } };
    await expect(diagnoseWithClient(ONE_PIXEL_PNG, client)).rejects.toThrow(
      "did not return a diagnosis",
    );
  });

  it("rejects a non-image data URL before any model call", async () => {
    const client = clientReturning(baseFixture);
    await expect(
      diagnoseWithClient("data:text/html;base64,PGh0bWw+", client),
    ).rejects.toThrow("JPEG, PNG, or WEBP");
    expect(client.responses.create).not.toHaveBeenCalled();
  });
});

describe("validateAndNormalizeDiagnosis edge cases", () => {
  it.each([
    ["fractional confidence", { confidence: 86.5 }],
    ["confidence above 100", { confidence: 101 }],
    ["negative confidence", { confidence: -1 }],
    ["confidence as string", { confidence: "86" }],
  ])("rejects %s", (_name, patch) => {
    expect(() =>
      validateAndNormalizeDiagnosis({ ...baseFixture, ...patch }),
    ).toThrow("confidence must be an integer from 0 to 100");
  });

  it("rejects empty evidence", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({ ...baseFixture, evidence: [] }),
    ).toThrow("evidence");
  });

  it("rejects more than four evidence tokens", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({
        ...baseFixture,
        evidence: ["a", "b", "c", "d", "e"],
      }),
    ).toThrow("evidence");
  });

  it("rejects whitespace-only evidence tokens", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({ ...baseFixture, evidence: ["1 + 1 = 2", "   "] }),
    ).toThrow("evidence");
  });

  it("rejects one or three alternatives", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({
        ...baseFixture,
        alternatives: baseFixture.alternatives.slice(0, 1),
      }),
    ).toThrow("exactly two alternatives");
    expect(() =>
      validateAndNormalizeDiagnosis({
        ...baseFixture,
        alternatives: [
          ...baseFixture.alternatives,
          {
            id: "unreadable_work",
            label: "Unreadable work",
            explanation: "Too blurry.",
          },
        ],
      }),
    ).toThrow("exactly two alternatives");
  });

  it("rejects an alternative id outside the allowed set", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({
        ...baseFixture,
        alternatives: [
          baseFixture.alternatives[0],
          { id: "invented_reason", label: "Invented", explanation: "Not in the set." },
        ],
      }),
    ).toThrow("Alternatives must be valid");
  });

  it("rejects duplicate alternatives", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({
        ...baseFixture,
        alternatives: [baseFixture.alternatives[0], baseFixture.alternatives[0]],
      }),
    ).toThrow("Alternatives must be valid");
  });

  it("rejects a blank transcription", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({ ...baseFixture, transcription: "  " }),
    ).toThrow("transcription");
  });

  it("rejects a non-object payload", () => {
    expect(() => validateAndNormalizeDiagnosis(null)).toThrow("not an object");
    expect(() => validateAndNormalizeDiagnosis("diagnosis")).toThrow("not an object");
  });

  it("trims transcription and evidence tokens", () => {
    const diagnosis = validateAndNormalizeDiagnosis({
      ...baseFixture,
      transcription: "  1/3 + 1/4 = 2/7  ",
      evidence: ["  1 + 1 = 2  "],
    });
    expect(diagnosis.transcription).toBe("1/3 + 1/4 = 2/7");
    expect(diagnosis.evidence).toEqual(["1 + 1 = 2"]);
  });

  it("threads a selected library alternative into the confirmed primary", () => {
    const withLibraryAlternative = validateAndNormalizeDiagnosis({
      ...baseFixture,
      primary: {
        id: "num_denom_meaning",
        label: "Treating numerator and denominator as unrelated whole numbers",
      },
      alternatives: [
        {
          id: "no_common_denominator",
          label: "Adding without a common denominator",
          explanation: "The student combined unlike pieces.",
        },
        baseFixture.alternatives[0],
      ],
    });
    const selected = diagnosisForSelectedHypothesis(
      withLibraryAlternative,
      "no_common_denominator",
    );
    expect(selected.primary).toEqual({
      id: "no_common_denominator",
      label: "Adding without a common denominator",
    });
    expect(selected.teacherCheckQuestion).toBe("Are these pieces the same size?");
    expect(selected.alternatives.map((item) => item.id)).toContain("num_denom_meaning");
  });

  it("replaces no_common_denominator when add_across is primary", () => {
    const result = validateAndNormalizeDiagnosis({
      ...baseFixture,
      alternatives: [
        {
          id: "no_common_denominator",
          label: "Adding without a common denominator",
          explanation: "The student combined unlike pieces.",
        },
        baseFixture.alternatives[0],
      ],
    });

    expect(result.alternatives.map((item) => item.id)).toEqual([
      "careless_slip",
      "misread_operation",
    ]);
  });

  it("refuses to build a full-lesson diagnosis from a quick-check cause", () => {
    const diagnosis = validateAndNormalizeDiagnosis(baseFixture);
    expect(() =>
      diagnosisForSelectedHypothesis(diagnosis, "careless_slip"),
    ).toThrow("Only a library misconception");
    expect(() =>
      diagnosisForSelectedHypothesis(diagnosis, "unreadable_work"),
    ).toThrow("Only a library misconception");
  });
});
