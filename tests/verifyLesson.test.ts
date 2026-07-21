import { describe, expect, it, vi } from "vitest";
import { validateLessonPack } from "../lib/lesson";
import { verifyAndRepairWithClient } from "../lib/verify-lesson-server";
import { injectBrokenTarget } from "../lib/verification-demo";
import type { LessonOpenAIClientLike } from "../lib/generate-lesson-server";
import type { Diagnosis } from "../lib/diagnosis";
import type { LessonPack } from "../types";

const diagnosis: Diagnosis = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: { id: "add_across", label: "Adding numerators and denominators directly" },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    { id: "careless_slip", label: "Careless slip (knows the method)", explanation: "Possible slip." },
    { id: "misread_operation", label: "Misread the operation", explanation: "Possible misread." },
  ],
  teacherCheckQuestion: "What does the denominator tell us about the size of each piece?",
};

const validPack: LessonPack = {
  operation: "add",
  misconception: "add_across",
  explanations: {
    scaffolded: { summary: "Make equal pieces.", steps: ["Rename each fraction."] },
    core: { summary: "Use a common denominator.", steps: ["Use twelfths."] },
    extension: { summary: "Explain why pieces must match.", steps: ["Generalize the rule."] },
  },
  manipulative: {
    type: "fraction_bar",
    operation: "add",
    misconception: "add_across",
    initial_state: { left: "1/3", right: "1/4" },
    target: "7/12",
    steps: [
      { prompt: "Make 12 equal parts", expected_partitions: 12, expected_shaded: 0 },
      { prompt: "Shade the sum", expected_partitions: 12, expected_shaded: 7 },
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

function broken(kind: "target" | "partitions" | "practice"): LessonPack {
  const pack = structuredClone(validPack);
  if (kind === "target") pack.manipulative.target = "2/7";
  if (kind === "partitions") pack.manipulative.steps[0].expected_partitions = 24;
  if (kind === "practice") pack.practice[0].answer = "2/5";
  return pack;
}

function repairingClient() {
  const create = vi.fn().mockImplementation(async (request: Record<string, any>) => {
    const name = request.text.format.name as string;
    return {
      output_text: JSON.stringify(
        name.includes("practice") ? validPack.practice[0] : validPack.manipulative,
      ),
    };
  });
  return {
    create,
    client: { responses: { create } } as unknown as LessonOpenAIClientLike,
  };
}

describe("verifyAndRepairWithClient", () => {
  it.each(["target", "partitions", "practice"] as const)(
    "catches a broken %s and repairs only its failing artifact",
    async (kind) => {
      const invalid = broken(kind);
      expect(() => validateLessonPack(invalid, diagnosis)).toThrow();
      const { client, create } = repairingClient();
      const verified = await verifyAndRepairWithClient(invalid, diagnosis, client);

      expect(verified.result.passed).toBe(true);
      expect(verified.result.repairCycles).toBe(1);
      expect(verified.result.notes.length).toBe(1);
      expect(create).toHaveBeenCalledTimes(1);
      expect(() => validateLessonPack(verified.pack, diagnosis)).not.toThrow();
    },
  );

  it("returns real assertion counts when no repair is needed", async () => {
    const create = vi.fn();
    const result = await verifyAndRepairWithClient(
      validPack,
      diagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );
    expect(create).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      passed: true,
      repairCycles: 0,
      checks: {
        schema: true,
        numerical: 4,
        answerKey: 5,
        stateTransition: 2,
        misconceptionAlignment: true,
      },
    });
  });

  it("verifies 1/9 + 1/4 including its compact visual transitions", async () => {
    const denseDiagnosis: Diagnosis = {
      ...diagnosis,
      transcription: "1/9 + 1/4 = 2/13",
    };
    const densePack = structuredClone(validPack);
    densePack.manipulative.initial_state = { left: "1/9", right: "1/4" };
    densePack.manipulative.target = "13/36";
    densePack.manipulative.steps = [
      { prompt: "Make 36 equal parts", expected_partitions: 36, expected_shaded: 0 },
      { prompt: "Shade the sum", expected_partitions: 36, expected_shaded: 13 },
    ];
    const create = vi.fn();

    const verified = await verifyAndRepairWithClient(
      densePack,
      denseDiagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );

    expect(create).not.toHaveBeenCalled();
    expect(verified.result).toMatchObject({
      passed: true,
      checks: {
        numerical: 4,
        answerKey: 5,
        stateTransition: 2,
        misconceptionAlignment: true,
      },
    });
    expect(verified.pack.manipulative.target).toBe("13/36");
  });

  it("stops after three failed repairs and does not claim verification", async () => {
    const invalid = broken("target");
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(invalid.manipulative),
    });
    const result = await verifyAndRepairWithClient(
      invalid,
      diagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );
    expect(result.result.passed).toBe(false);
    expect(result.result.repairCycles).toBe(3);
    expect(create).toHaveBeenCalledTimes(3);
    expect(result.result.notes).toContain("Manipulative target is not the correct reduced sum.");
  });

  it("the dev demo injects one deterministic target failure", () => {
    const injected = injectBrokenTarget(validPack);
    expect(injected.manipulative.target).not.toBe(validPack.manipulative.target);
    expect(() => validateLessonPack(injected, diagnosis)).toThrow("correct reduced sum");
  });

  it("sends only the failing artifact to the repair model and leaves the rest untouched", async () => {
    const invalid = broken("practice");
    const { client, create } = repairingClient();
    const verified = await verifyAndRepairWithClient(invalid, diagnosis, client);

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("gpt-5.6-sol");
    expect(request.store).toBe(false);
    expect(request.reasoning).toEqual({ effort: "high" });
    expect(request.text.format.name).toBe("chalk_repair_practice");
    const input = JSON.parse(request.input);
    expect(input.failingArtifact).toEqual(invalid.practice[0]);
    expect(input.validatorError).toContain("Practice item 1");
    expect(input).not.toHaveProperty("pack");
    expect(JSON.stringify(input.failingArtifact)).not.toContain("scaffolded");

    // Everything except the repaired practice item is byte-identical.
    expect(verified.pack.explanations).toEqual(validPack.explanations);
    expect(verified.pack.manipulative).toEqual(validPack.manipulative);
    expect(verified.pack.exitTicket).toEqual(validPack.exitTicket);
    expect(verified.pack.practice[1]).toEqual(validPack.practice[1]);
  });

  it("isolates and repairs a prose-prefixed exit ticket", async () => {
    const invalid = structuredClone(validPack);
    invalid.exitTicket.question = "Using 12 equal parts, solve: 1/3 + 1/6";
    expect(() => validateLessonPack(invalid, diagnosis)).toThrow(
      "Exit ticket question must be a bare fraction addition",
    );

    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(validPack.exitTicket),
    });
    const verified = await verifyAndRepairWithClient(
      invalid,
      diagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );

    expect(verified.result.passed).toBe(true);
    expect(verified.result.repairCycles).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].text.format.name).toBe("chalk_repair_exitTicket");
    expect(verified.pack.exitTicket).toEqual(validPack.exitTicket);
  });

  it("stops safely with no model call when the failure cannot be isolated", async () => {
    const invalid = structuredClone(validPack);
    invalid.practice = [validPack.practice[0]];
    const create = vi.fn();
    const result = await verifyAndRepairWithClient(
      invalid,
      diagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );
    expect(create).not.toHaveBeenCalled();
    expect(result.result.passed).toBe(false);
    expect(result.result.repairCycles).toBe(0);
    expect(result.result.notes).toContain(
      "The failing artifact could not be isolated for a safe repair.",
    );
  });

  it("terminates when the repair model keeps returning unusable output", async () => {
    const invalid = broken("target");
    const create = vi.fn().mockResolvedValue({ output_text: "" });
    const result = await verifyAndRepairWithClient(
      invalid,
      diagnosis,
      { responses: { create } } as unknown as LessonOpenAIClientLike,
    );
    expect(result.result.passed).toBe(false);
    expect(result.result.repairCycles).toBe(3);
    expect(create).toHaveBeenCalledTimes(3);
    expect(result.result.notes.some((note) => note.includes("returned no artifact"))).toBe(true);
  });
});
