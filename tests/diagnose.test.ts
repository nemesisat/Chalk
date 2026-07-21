import { describe, expect, it, vi } from "vitest";
import { diagnoseWithClient } from "../lib/diagnose-server";
import { validateAndNormalizeDiagnosis } from "../lib/diagnosis";
import { MISCONCEPTIONS } from "../lib/misconceptions";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const fixtureResponse = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: {
    id: "add_across",
    label: "A model-supplied label that must not be trusted",
  },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    {
      id: "careless_slip",
      label: "Careless slip (knows the method)",
      explanation: "The student may know the method but have reverted under time pressure.",
    },
    {
      id: "misread_operation",
      label: "Misread the operation",
      explanation: "The student may have read the addition sign incorrectly.",
    },
  ],
  teacherCheckQuestion: "A model-supplied question that must not be trusted",
};

describe("diagnoseWithClient", () => {
  it("sends a sanitized original-detail image and strict schema to Responses API", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(fixtureResponse),
    });

    const diagnosis = await diagnoseWithClient(ONE_PIXEL_PNG, {
      responses: { create },
    });

    expect(diagnosis.primary).toEqual({
      id: "add_across",
      label: MISCONCEPTIONS.add_across.label,
    });
    expect(diagnosis.teacherCheckQuestion).toBe(
      MISCONCEPTIONS.add_across.teacherCheckQuestion,
    );

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("gpt-5.6-sol");
    expect(request.reasoning).toEqual({ effort: "high", mode: "pro" });
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "fraction_work_diagnosis",
    });
    const image = request.input[0].content[1];
    expect(image.detail).toBe("original");
    expect(image.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(image.image_url).not.toBe(ONE_PIXEL_PNG);
  });

  it("rejects a primary id outside the fixed library", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        ...fixtureResponse,
        primary: { id: "invented_misconception", label: "Invented" },
      }),
    });

    await expect(
      diagnoseWithClient(ONE_PIXEL_PNG, { responses: { create } }),
    ).rejects.toThrow("unknown misconception");
  });
});

describe("validateAndNormalizeDiagnosis", () => {
  it("rejects duplicate or primary-equivalent alternatives", () => {
    expect(() =>
      validateAndNormalizeDiagnosis({
        ...fixtureResponse,
        alternatives: [
          {
            id: "add_across",
            label: "Same as primary",
            explanation: "This merely restates the primary.",
          },
          {
            id: "misread_operation",
            label: "Misread the operation",
            explanation: "The student may have misread the operation sign.",
          },
        ],
      }),
    ).toThrow("different from the primary");
  });

  it("accepts low-confidence unreadable work without over-claiming", () => {
    const diagnosis = validateAndNormalizeDiagnosis({
      ...fixtureResponse,
      confidence: 18,
      evidence: ["work unclear"],
      alternatives: [
        {
          id: "unreadable_work",
          label: "Unreadable work",
          explanation: "The handwriting does not support a reliable conclusion.",
        },
        {
          id: "careless_slip",
          label: "Careless slip (knows the method)",
          explanation: "The student may know the method but have made a one-off error.",
        },
      ],
    });
    expect(diagnosis.confidence).toBe(18);
    expect(diagnosis.alternatives[0].id).toBe("unreadable_work");
  });
});
