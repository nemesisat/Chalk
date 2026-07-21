import { describe, expect, it, vi } from "vitest";
import {
  validateAndNormalizeDiagnosis,
  type Diagnosis,
} from "../lib/diagnosis";
import { diagnoseWithClient } from "../lib/diagnose-server";
import {
  generateLessonArtifactWithClient,
  type LessonOpenAIClientLike,
} from "../lib/generate-lesson-server";
import {
  lessonPackJsonSchemaFor,
  validateLessonPack,
} from "../lib/lesson";
import { verifyAndRepairWithClient } from "../lib/verify-lesson-server";
import type { LessonPack } from "../types";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export const subtractionDiagnosis: Diagnosis = {
  operation: "subtract",
  transcription: "3/4 − 1/3 = 2/1",
  primary: {
    id: "subtract_across",
    label: "Subtracting numerators and denominators directly",
  },
  confidence: 86,
  evidence: ["3 − 1 = 2", "4 − 3 = 1"],
  alternatives: [
    {
      id: "careless_slip",
      label: "Careless slip (knows the method)",
      explanation: "The student may know the method and have made a one-off slip.",
    },
    {
      id: "misread_operation",
      label: "Misread the operation",
      explanation: "The student may have misread the sign.",
    },
  ],
  teacherCheckQuestion:
    "What must be true about the size of the pieces before we subtract them?",
};

export const subtractionPack: LessonPack = {
  operation: "subtract",
  misconception: "subtract_across",
  explanations: {
    scaffolded: {
      summary: "Make both fractions use equal-sized pieces before taking any away.",
      steps: ["Rename three fourths as nine twelfths.", "Rename one third as four twelfths."],
    },
    core: {
      summary: "Subtract equal-sized pieces, then count what remains.",
      steps: ["Start with nine twelfths.", "Take away four twelfths.", "Five twelfths remain."],
    },
    extension: {
      summary: "Explain why subtraction only works when the pieces have the same size.",
      steps: ["Compare the original piece sizes.", "Connect the bar model to the number sentence."],
    },
  },
  manipulative: {
    type: "fraction_bar",
    operation: "subtract",
    misconception: "subtract_across",
    initial_state: { left: "3/4", right: "1/3" },
    target: "5/12",
    steps: [
      {
        prompt: "Shade three fourths as nine twelfths",
        expected_partitions: 12,
        expected_shaded: 9,
        expected_removed: 0,
      },
      {
        prompt: "Mark four twelfths to take away",
        expected_partitions: 12,
        expected_shaded: 5,
        expected_removed: 4,
      },
      {
        prompt: "Read the five twelfths that remain",
        expected_partitions: 12,
        expected_shaded: 5,
        expected_removed: 0,
      },
    ],
  },
  practice: [
    { question: "3/4 − 1/3", answer: "5/12", targetsMisconception: true },
    { question: "5/6 − 1/3", answer: "1/2", targetsMisconception: true },
    { question: "2/3 − 1/4", answer: "5/12", targetsMisconception: true },
    { question: "5/6 − 1/4", answer: "7/12", targetsMisconception: true },
  ],
  exitTicket: { question: "2/3 − 1/4", answer: "5/12" },
};

describe("subtraction diagnosis", () => {
  it("returns an operator-aware subtraction diagnosis through the vision action contract", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(subtractionDiagnosis),
    });
    const diagnosis = await diagnoseWithClient(ONE_PIXEL_PNG, {
      responses: { create },
    });

    expect(diagnosis.operation).toBe("subtract");
    expect(diagnosis.primary.id).toBe("subtract_across");
    const request = create.mock.calls[0][0];
    expect(request.text.format.schema.properties.operation.enum).toEqual(["add", "subtract"]);
    expect(request.instructions).toContain("detect whether the operation is addition or subtraction");
  });

  it("detects subtraction from the transcription and remaps an add-across model id", () => {
    const normalized = validateAndNormalizeDiagnosis({
      ...subtractionDiagnosis,
      operation: "add",
      primary: {
        id: "add_across",
        label: "Adding numerators and denominators directly",
      },
      alternatives: [
        {
          id: "subtract_no_common_denominator",
          label: "Subtracting without a common denominator",
          explanation: "The pieces were not renamed.",
        },
        subtractionDiagnosis.alternatives[0],
      ],
    });

    expect(normalized.operation).toBe("subtract");
    expect(normalized.primary.id).toBe("subtract_across");
    expect(normalized.alternatives.map((item) => item.id)).toEqual([
      "careless_slip",
      "misread_operation",
    ]);
  });
});

describe("subtraction generation contract", () => {
  it("pins subtraction in the pack and fraction-bar schemas", () => {
    const schema = lessonPackJsonSchemaFor("subtract_across", "subtract");
    expect(schema.properties.operation.const).toBe("subtract");
    expect(schema.properties.manipulative.properties.operation.const).toBe("subtract");
    expect(schema.properties.manipulative.properties.steps.items.required)
      .toContain("expected_removed");
    expect(schema.properties.practice.items.properties.question.pattern).toContain("[-−]");
  });

  it("routes an independent manipulative draft through the subtraction schema", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(subtractionPack.manipulative),
    });
    const result = await generateLessonArtifactWithClient(
      subtractionDiagnosis,
      "manipulative",
      { responses: { create } },
    );

    expect(result).toEqual(subtractionPack.manipulative);
    const request = create.mock.calls[0][0];
    expect(request.input).toContain("Confirmed operation: subtract");
    expect(request.text.format.schema.properties.operation.const).toBe("subtract");
    expect(request.text.format.schema.properties.steps.items.required)
      .toContain("expected_removed");
  });
});

describe("subtraction deterministic verification", () => {
  it("accepts the correct LCD, take-away transition, reduced difference, and answer keys", () => {
    expect(validateLessonPack(subtractionPack, subtractionDiagnosis)).toEqual(subtractionPack);
  });

  it("catches an incorrect removal transition", () => {
    const invalid = structuredClone(subtractionPack);
    invalid.manipulative.steps[1].expected_removed = 3;
    expect(() => validateLessonPack(invalid, subtractionDiagnosis)).toThrow(
      "mark the amount removed",
    );
  });

  it("rejects negative-order and incorrect practice differences", () => {
    const negativeOrder = structuredClone(subtractionPack);
    negativeOrder.practice[0] = {
      question: "1/3 − 3/4",
      answer: "5/12",
      targetsMisconception: true,
    };
    expect(() => validateLessonPack(negativeOrder, subtractionDiagnosis)).toThrow(
      "larger fraction first",
    );

    const wrongAnswer = structuredClone(subtractionPack);
    wrongAnswer.exitTicket.answer = "1/3";
    expect(() => validateLessonPack(wrongAnswer, subtractionDiagnosis)).toThrow(
      "correct reduced difference",
    );
  });

  it("repairs a broken subtraction target and re-verifies", async () => {
    const broken = structuredClone(subtractionPack);
    broken.manipulative.target = "1/2";
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(subtractionPack.manipulative),
    });
    const result = await verifyAndRepairWithClient(
      broken,
      subtractionDiagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );

    expect(result.result.passed).toBe(true);
    expect(result.result.repairCycles).toBe(1);
    expect(result.pack.manipulative.target).toBe("5/12");
    expect(create.mock.calls[0][0].text.format.schema.properties.operation.const)
      .toBe("subtract");
  });

  it("catches a triplicate practice set and repairs both duplicate items", async () => {
    const triplicate = structuredClone(subtractionPack);
    triplicate.practice = [
      subtractionPack.practice[0],
      subtractionPack.practice[1],
      subtractionPack.practice[0],
      subtractionPack.practice[3],
      subtractionPack.practice[0],
    ];
    expect(() => validateLessonPack(triplicate, subtractionDiagnosis)).toThrow(
      "Practice item 3 duplicates Practice item 1",
    );

    const create = vi.fn()
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          question: "3/4 − 1/2",
          answer: "1/4",
          targetsMisconception: true,
        }),
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          question: "2/3 − 1/6",
          answer: "1/2",
          targetsMisconception: true,
        }),
      });
    const repaired = await verifyAndRepairWithClient(
      triplicate,
      subtractionDiagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );

    expect(repaired.result.passed).toBe(true);
    expect(repaired.result.repairCycles).toBe(2);
    expect(new Set(repaired.pack.practice.map((item) => item.question)).size).toBe(5);
    expect(JSON.parse(create.mock.calls[0][0].input).questionsToAvoid).toContain(
      "3/4 − 1/3",
    );
  });

  it("repairs a garbled explanation step as prose", async () => {
    const garbled = structuredClone(subtractionPack);
    garbled.explanations.core.steps[0] =
      "2/3 - 1/4 5/12 5/6 - 1/4 7/12 3/4 - 1/3 5/12";
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(subtractionPack.explanations.core),
    });
    const repaired = await verifyAndRepairWithClient(
      garbled,
      subtractionDiagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );

    expect(repaired.result.passed).toBe(true);
    expect(repaired.result.repairCycles).toBe(1);
    expect(repaired.pack.explanations.core).toEqual(subtractionPack.explanations.core);
    expect(create.mock.calls[0][0].text.format.name).toBe("chalk_repair_explanation");
  });
});
