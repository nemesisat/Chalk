import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractResponseText,
  generateLessonArtifactWithClient,
  generateLessonWithClient,
  resetHostedMultiAgentCapabilityForTests,
  type LessonOpenAIClientLike,
} from "../lib/generate-lesson-server";
import {
  fractionsFromTranscription,
  lessonPackJsonSchemaFor,
  validateLessonPack,
} from "../lib/lesson";
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

const fixture: LessonPack = {
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
      steps: ["Compare the unit fractions.", "Generalize the common-denominator rule."],
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
    { question: "2/3 + 1/4", answer: "11/12", targetsMisconception: true },
    { question: "1/6 + 1/3", answer: "1/2", targetsMisconception: true },
  ],
  exitTicket: { question: "1/3 + 1/6", answer: "1/2" },
};

describe("LessonPack contract", () => {
  it("exposes a strict schema and accepts an internally consistent fixture", () => {
    const schema = lessonPackJsonSchemaFor("add_across");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("manipulative");
    expect(schema.properties.misconception).toEqual({ type: "string", const: "add_across" });
    expect(schema.properties.manipulative.properties.misconception).toEqual({
      type: "string",
      const: "add_across",
    });
    expect(validateLessonPack(fixture, diagnosis)).toEqual(fixture);
  });

  it("normalizes a known misconception label back to its fixed id", () => {
    const liveShaped = structuredClone(fixture) as unknown as Record<string, unknown>;
    liveShaped.misconception = diagnosis.primary.label;
    (liveShaped.manipulative as Record<string, unknown>).misconception = diagnosis.primary.label;
    const result = validateLessonPack(liveShaped, diagnosis);
    expect(result.misconception).toBe("add_across");
    expect(result.manipulative.misconception).toBe("add_across");
  });

  it("anchors addends to the operands around the plus sign", () => {
    expect(fractionsFromTranscription("2/7 from 1/3 + 1/4")).toEqual(["1/3", "1/4"]);
  });

  it("rejects partitions that are not exactly the LCD", () => {
    const invalid = structuredClone(fixture);
    invalid.manipulative.steps[0].expected_partitions = 24;
    expect(() => validateLessonPack(invalid, diagnosis)).toThrow("use the LCD");
  });

  it("rejects final shading that does not equal the sum in LCD parts", () => {
    const invalid = structuredClone(fixture);
    invalid.manipulative.steps[1].expected_shaded = 6;
    expect(() => validateLessonPack(invalid, diagnosis)).toThrow("final shading");
  });

  it("rejects incorrect practice answers", () => {
    const invalid = structuredClone(fixture);
    invalid.practice[0].answer = "2/5";
    expect(() => validateLessonPack(invalid, diagnosis)).toThrow("correct reduced sum");
  });

  it("rejects practice denominators over 12", () => {
    const invalid = structuredClone(fixture);
    invalid.practice[0] = {
      question: "1/13 + 1/2",
      answer: "15/26",
      targetsMisconception: true,
    };
    expect(() => validateLessonPack(invalid, diagnosis)).toThrow("12 or less");
  });

  it("requires unlike denominators for add-across practice", () => {
    const invalid = structuredClone(fixture);
    invalid.practice[0] = {
      question: "1/3 + 1/3",
      answer: "2/3",
      targetsMisconception: true,
    };
    expect(() => validateLessonPack(invalid, diagnosis)).toThrow("unlike denominators");
  });
});

describe("generateLessonWithClient", () => {
  beforeEach(() => resetHostedMultiAgentCapabilityForTests());

  it("accepts the live beta root-message shape and avoids fallback", async () => {
    const betaResponse = {
      output: [{
        type: "message",
        agent: { agent_name: "/root" },
        phase: "final_answer",
        content: [{ type: "output_text", text: JSON.stringify(fixture) }],
      }],
    };
    expect(extractResponseText(betaResponse)).toBe(JSON.stringify(fixture));
    const betaCreate = vi.fn().mockResolvedValue(betaResponse);
    const create = vi.fn();
    const client = {
      responses: { create },
      beta: { responses: { create: betaCreate } },
    } as unknown as LessonOpenAIClientLike;

    await expect(generateLessonWithClient(diagnosis, client)).resolves.toEqual(fixture);
    expect(create).not.toHaveBeenCalled();
    const request = betaCreate.mock.calls[0][0];
    expect(request.model).toBe("gpt-5.6-sol");
    expect(request.store).toBe(false);
    expect(request.betas).toEqual(["responses_multi_agent=v1"]);
    expect(request.multi_agent).toEqual({ enabled: true, max_concurrent_subagents: 5 });
    expect(request.reasoning).toEqual({ effort: "high", context: "all_turns" });
    expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(request.text.format.schema.properties.misconception.const).toBe("add_across");
    expect(request.text.format.schema.properties.manipulative.properties.misconception.const).toBe("add_across");
  });

  it("falls back to six parallel Terra/Luna drafts and Sol synthesis", async () => {
    const betaCreate = vi.fn().mockRejectedValue(new Error("beta unavailable"));
    const create = vi.fn().mockImplementation(async (request: Record<string, unknown>) => ({
      output_text: request.model === "gpt-5.6-sol" ? JSON.stringify(fixture) : "{}",
    }));
    const client = {
      responses: { create },
      beta: { responses: { create: betaCreate } },
    } as unknown as LessonOpenAIClientLike;

    await expect(generateLessonWithClient(diagnosis, client)).resolves.toEqual(fixture);
    expect(create).toHaveBeenCalledTimes(7);
    const models = create.mock.calls.map(([request]) => request.model);
    expect(models.filter((model) => model === "gpt-5.6-terra")).toHaveLength(3);
    expect(models.filter((model) => model === "gpt-5.6-luna")).toHaveLength(3);
    expect(models.at(-1)).toBe("gpt-5.6-sol");
  });

  it("caches an unsupported beta result and skips the paid call next time", async () => {
    const betaCreate = vi.fn().mockResolvedValue({ output: [] });
    const create = vi.fn().mockImplementation(async (request: Record<string, unknown>) => ({
      output_text: request.model === "gpt-5.6-sol" ? JSON.stringify(fixture) : "{}",
    }));
    const client = {
      responses: { create },
      beta: { responses: { create: betaCreate } },
    } as unknown as LessonOpenAIClientLike;

    await generateLessonWithClient(diagnosis, client);
    await generateLessonWithClient(diagnosis, client);
    expect(betaCreate).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(14);
  });
});

describe("generateLessonArtifactWithClient", () => {
  it("returns one explanation without waiting for a synthesized pack", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(fixture.explanations.scaffolded),
    });
    const result = await generateLessonArtifactWithClient(
      diagnosis,
      "scaffolded",
      { responses: { create } },
    );
    expect(result).toEqual(fixture.explanations.scaffolded);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.6-terra",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(create.mock.calls[0][0].instructions).toContain("teacher could say aloud");
    expect(create.mock.calls[0][0].input).not.toContain('{"transcription"');
    expect(create.mock.calls[0][0].input).toContain("Never put JSON");
  });

  it("unwraps the independently generated practice array", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({ practice: fixture.practice }),
    });
    const result = await generateLessonArtifactWithClient(
      diagnosis,
      "practice",
      { responses: { create } },
    );
    expect(result).toEqual(fixture.practice);
    expect(create.mock.calls[0][0].model).toBe("gpt-5.6-luna");
    expect(create.mock.calls[0][0].text.format.schema.properties.practice.minItems).toBe(5);
    expect(create.mock.calls[0][0].text.format.schema.properties.practice.items.properties.question.pattern)
      .toContain("\\+");
  });
});
