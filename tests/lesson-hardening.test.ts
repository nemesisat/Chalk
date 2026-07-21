import { describe, expect, it, vi } from "vitest";
import {
  generateLessonWithClient,
  type LessonOpenAIClientLike,
} from "../lib/generate-lesson-server";
import {
  validateLessonPack,
} from "../lib/lesson";
import { validateFractionBarSpec } from "../components/FractionBar";
import type { Diagnosis } from "../lib/diagnosis";
import type { LessonPack } from "../types";

const diagnosis: Diagnosis = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: {
    id: "add_across",
    label: "Adding numerators and denominators directly",
  },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    {
      id: "careless_slip",
      label: "Careless slip (knows the method)",
      explanation: "The student may know the method.",
    },
    {
      id: "misread_operation",
      label: "Misread the operation",
      explanation: "The student may have misread the sign.",
    },
  ],
  teacherCheckQuestion: "What does the denominator tell us about the size of each piece?",
};

const validPack: LessonPack = {
  operation: "add",
  misconception: "add_across",
  explanations: {
    scaffolded: {
      summary: "Make the pieces the same size first.",
      steps: ["Name each denominator.", "Rename both fractions in twelfths."],
    },
    core: {
      summary: "Use a common denominator before adding.",
      steps: ["Find 12.", "Write 4/12 + 3/12.", "Add to get 7/12."],
    },
    extension: {
      summary: "Explain why only equal-sized parts can combine.",
      steps: ["Compare the unit fractions.", "Generalize the rule."],
    },
  },
  manipulative: {
    type: "fraction_bar",
    operation: "add",
    misconception: "add_across",
    initial_state: { left: "1/3", right: "1/4" },
    target: "7/12",
    steps: [
      { prompt: "Make 12 equal parts", expected_partitions: 12, expected_shaded: 0 },
      { prompt: "Shade the combined amount", expected_partitions: 12, expected_shaded: 7 },
    ],
  },
  practice: [
    { question: "1/2 + 1/3", answer: "5/6", targetsMisconception: true },
    { question: "1/4 + 1/6", answer: "5/12", targetsMisconception: true },
    { question: "1/2 + 1/4", answer: "3/4", targetsMisconception: true },
    { question: "1/6 + 1/3", answer: "1/2", targetsMisconception: true },
  ],
  exitTicket: { question: "1/3 + 1/6", answer: "1/2" },
};

function pack(patch: (draft: LessonPack) => void): LessonPack {
  const draft = structuredClone(validPack);
  patch(draft);
  return draft;
}

describe("validateLessonPack — live-failure regressions", () => {
  it("normalizes a pack misconception label to the fixed id as a safety net", () => {
    const result = validateLessonPack(
      pack((d) => {
        d.misconception = "Adding numerators and denominators directly";
      }),
      diagnosis,
    );
    expect(result.misconception).toBe("add_across");
  });

  it("normalizes a manipulative misconception label to the fixed id as a safety net", () => {
    const result = validateLessonPack(
      pack((d) => {
        d.manipulative.misconception = "Adding numerators and denominators directly";
      }),
      diagnosis,
    );
    expect(result.manipulative.misconception).toBe("add_across");
  });

  it.each([
    ["explanation", (draft: LessonPack) => { draft.explanations.core.steps[0] = "Read manipulative.initial_state { carefully."; }],
    ["practice", (draft: LessonPack) => { draft.practice[0].question = "targetsMisconception: true"; }],
    ["exit ticket", (draft: LessonPack) => { draft.exitTicket.question = "expected_partitions { 12 }"; }],
  ] as const)("rejects leaked internal language in %s text", (_name, mutate) => {
    expect(() => validateLessonPack(pack(mutate), diagnosis)).toThrow(
      "internal implementation language",
    );
  });
});

describe("validateLessonPack — manipulative internal consistency", () => {
  it("rejects a manipulative that swaps the diagnosed addends", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.manipulative.initial_state = { left: "1/4", right: "1/3" };
        }),
        diagnosis,
      ),
    ).toThrow("diagnosed problem fractions");
  });

  it("rejects an unreduced target even when equivalent", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.manipulative.target = "14/24";
        }),
        diagnosis,
      ),
    ).toThrow("correct reduced sum");
  });

  it("rejects a wrong target", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.manipulative.target = "2/7";
        }),
        diagnosis,
      ),
    ).toThrow("correct reduced sum");
  });

  it("rejects an empty steps array", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.manipulative.steps = [];
        }),
        diagnosis,
      ),
    ).toThrow("at least one step");
  });

  it("rejects shaded counts above the partition count", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.manipulative.steps[1].expected_shaded = 13;
        }),
        diagnosis,
      ),
    ).toThrow("use the LCD");
  });

  it("rejects diagnosed sums greater than one whole", () => {
    const bigDiagnosis: Diagnosis = {
      ...diagnosis,
      transcription: "2/3 + 3/4 = 5/7",
    };
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.manipulative.initial_state = { left: "2/3", right: "3/4" };
          d.manipulative.target = "17/12";
          d.manipulative.steps = [
            { prompt: "Combine", expected_partitions: 12, expected_shaded: 12 },
          ];
        }),
        bigDiagnosis,
      ),
    ).toThrow("no greater than one whole");
  });

  it("accepts a valid lesson when an uploaded addend denominator is above 12", () => {
    const wideDiagnosis: Diagnosis = {
      ...diagnosis,
      transcription: "1/13 + 1/2 = 2/15",
    };
    expect(() => validateLessonPack(
      pack((d) => {
        d.manipulative.initial_state = { left: "1/13", right: "1/2" };
        d.manipulative.target = "15/26";
        d.manipulative.steps = [
          { prompt: "Combine", expected_partitions: 26, expected_shaded: 15 },
        ];
      }),
      wideDiagnosis,
    )).not.toThrow();
  });

  it("verifies 1/9 + 1/4 with an exact 36-part visual", () => {
    const denseDiagnosis: Diagnosis = {
      ...diagnosis,
      transcription: "1/9 + 1/4 = 2/13",
    };
    const densePack = pack((draft) => {
      draft.manipulative.initial_state = { left: "1/9", right: "1/4" };
      draft.manipulative.target = "13/36";
      draft.manipulative.steps = [
        { prompt: "Make equal parts", expected_partitions: 36, expected_shaded: 0 },
        { prompt: "Shade the sum", expected_partitions: 36, expected_shaded: 13 },
      ];
    });

    expect(() => validateLessonPack(densePack, denseDiagnosis)).not.toThrow();
    expect(() => validateFractionBarSpec(densePack.manipulative)).not.toThrow();
  });
});

describe("validateLessonPack — practice answers", () => {
  it("treats reversed addition operands as a duplicate normalized problem", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.practice[3] = {
            question: "1/3 + 1/2",
            answer: "5/6",
            targetsMisconception: true,
          };
        }),
        diagnosis,
      ),
    ).toThrow("Practice item 4 duplicates Practice item 1");
  });

  it("rejects an unreduced practice answer even when numerically equivalent", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.practice[1] = { question: "1/4 + 1/6", answer: "10/24", targetsMisconception: true };
        }),
        diagnosis,
      ),
    ).toThrow("correct reduced sum");
  });

  it("rejects practice questions that are not bare additions", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.practice[0] = { question: "1/2 - 1/3", answer: "1/6", targetsMisconception: true };
        }),
        diagnosis,
      ),
    ).toThrow("bare fraction addition");
  });

  it("rejects targetsMisconception=false", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.practice[0] = {
            question: "1/2 + 1/3",
            answer: "5/6",
            targetsMisconception: false as unknown as true,
          };
        }),
        diagnosis,
      ),
    ).toThrow("must target the confirmed misconception");
  });

  it("rejects an incorrect exit-ticket answer", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.exitTicket = { question: "1/3 + 1/6", answer: "2/9" };
        }),
        diagnosis,
      ),
    ).toThrow("correct reduced sum");
  });

  it("labels a prose-prefixed exit ticket so Stage 4 can isolate it", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.exitTicket = {
            question: "Using 12 equal parts, solve: 1/3 + 1/6",
            answer: "1/2",
          };
        }),
        diagnosis,
      ),
    ).toThrow("Exit ticket question must be a bare fraction addition");
  });
});

describe("validateLessonPack — clean explanation prose", () => {
  it("rejects a run-on list of fraction problems and answers inside an explanation step", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.explanations.core.steps[0] =
            "2/3 - 1/4 5/12 5/6 - 1/4 7/12 3/4 - 1/3 5/12";
        }),
        diagnosis,
      ),
    ).toThrow("Core explanation contains a list of practice problems or answers");
  });

  it("allows fractions inside a genuine teaching sentence", () => {
    expect(() =>
      validateLessonPack(
        pack((d) => {
          d.explanations.core.steps[0] =
            "Rename 1/3 as 4/12 and 1/4 as 3/12 before combining equal-sized pieces.";
        }),
        diagnosis,
      ),
    ).not.toThrow();
  });
});

describe("generateLessonWithClient — malformed model output", () => {
  function fallbackClient(synthesisOutput: string | undefined) {
    const betaCreate = vi.fn().mockRejectedValue(new Error("beta unavailable"));
    const create = vi.fn().mockImplementation(async (request: Record<string, unknown>) => ({
      output_text: request.model === "gpt-5.6-sol" ? synthesisOutput : "{}",
    }));
    return {
      client: {
        responses: { create },
        beta: { responses: { create: betaCreate } },
      } as unknown as LessonOpenAIClientLike,
      create,
    };
  }

  it("rejects non-JSON synthesis output gracefully", async () => {
    const { client } = fallbackClient("not valid json {");
    await expect(generateLessonWithClient(diagnosis, client)).rejects.toThrow(
      "invalid lesson pack JSON",
    );
  });

  it("rejects an empty synthesis response gracefully", async () => {
    const { client } = fallbackClient(undefined);
    await expect(generateLessonWithClient(diagnosis, client)).rejects.toThrow(
      "did not return a lesson pack",
    );
  });

  it("passes a mathematically flawed synthesized pack to the Stage 4 verifier", async () => {
    const bad = pack((d) => {
      d.practice[0].answer = "2/5";
    });
    const { client } = fallbackClient(JSON.stringify(bad));
    await expect(generateLessonWithClient(diagnosis, client)).resolves.toEqual(bad);
  });

  it("does not block generation for a diagnosed 36-part LCD", async () => {
    const denseDiagnosis: Diagnosis = {
      ...diagnosis,
      transcription: "1/9 + 1/4 = 2/13",
    };
    const densePack = pack((draft) => {
      draft.manipulative.initial_state = { left: "1/9", right: "1/4" };
      draft.manipulative.target = "13/36";
      draft.manipulative.steps = [
        { prompt: "Make 36 equal parts", expected_partitions: 36, expected_shaded: 0 },
        { prompt: "Shade the sum", expected_partitions: 36, expected_shaded: 13 },
      ];
    });
    const { client, create } = fallbackClient(JSON.stringify(densePack));

    await expect(generateLessonWithClient(denseDiagnosis, client)).resolves.toEqual(densePack);
    expect(create).toHaveBeenCalled();
  });

  it("fails when a draft subagent returns no text", async () => {
    const betaCreate = vi.fn().mockRejectedValue(new Error("beta unavailable"));
    const create = vi.fn().mockImplementation(async (request: Record<string, unknown>) => ({
      output_text: request.model === "gpt-5.6-terra" ? undefined : "{}",
    }));
    const client = {
      responses: { create },
      beta: { responses: { create: betaCreate } },
    } as unknown as LessonOpenAIClientLike;
    await expect(generateLessonWithClient(diagnosis, client)).rejects.toThrow(
      "did not return a draft",
    );
  });

  it("falls back when the hosted multi-agent response has no output_text (observed live)", async () => {
    // The first empty beta response is treated as unsupported and routes to fallback.
    const betaCreate = vi.fn().mockResolvedValue({ id: "resp_123" });
    const create = vi.fn().mockImplementation(async (request: Record<string, unknown>) => ({
      output_text: request.model === "gpt-5.6-sol" ? JSON.stringify(validPack) : "{}",
    }));
    const client = {
      responses: { create },
      beta: { responses: { create: betaCreate } },
    } as unknown as LessonOpenAIClientLike;

    await expect(generateLessonWithClient(diagnosis, client)).resolves.toEqual(validPack);
    expect(betaCreate).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(7);
  });
});

describe("FractionBar and server validation stay consistent", () => {
  it("accepts every spec the server validator accepts (golden cases)", () => {
    expect(() => validateFractionBarSpec(validPack.manipulative)).not.toThrow();
    expect(() =>
      validateFractionBarSpec({
        type: "fraction_bar",
        operation: "add",
        misconception: "add_across",
        initial_state: { left: "1/2", right: "1/4" },
        target: "3/4",
        steps: [{ prompt: "Shade", expected_partitions: 4, expected_shaded: 3 }],
      }),
    ).not.toThrow();
  });

  it("rejects a final step that contradicts the target", () => {
    expect(() =>
      validateFractionBarSpec({
        ...validPack.manipulative,
        steps: [{ prompt: "Shade", expected_partitions: 12, expected_shaded: 6 }],
      }),
    ).toThrow("does not match the target");
  });

  it("rejects multiples of the LCD exactly like the server validator", () => {
    const multipleOfLcd = {
      ...validPack.manipulative,
      steps: [{ prompt: "Shade", expected_partitions: 24, expected_shaded: 14 }],
    };
    expect(() => validateFractionBarSpec(multipleOfLcd)).toThrow("common denominator");
    expect(() =>
      validateLessonPack(pack((d) => { d.manipulative = multipleOfLcd; }), diagnosis),
    ).toThrow("use the LCD");
  });
});
