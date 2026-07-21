import {
  normalizeMisconceptionId,
  type Diagnosis,
} from "./diagnosis";
import {
  calculateFractions,
  compareFractions,
  equivalent,
  formatFraction,
  gcd,
  lcm,
  parseFractionExpression,
  parseFraction,
  reduce,
  type Fraction,
} from "./fraction-math";
import type { MisconceptionId } from "./misconceptions";
import type { FractionBarSpec, FractionOperation, LessonPack } from "../types";

export const explanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1 },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "string",
        minLength: 1,
        description: "One clean prose teaching sentence; never a list of practice problems or answers",
      },
    },
  },
  required: ["summary", "steps"],
} as const;

export function fractionBarSpecJsonSchemaFor(
  misconceptionId: MisconceptionId,
  operation: FractionOperation = "add",
) {
  const stepProperties = {
    prompt: { type: "string", minLength: 1 },
    expected_partitions: {
      type: "integer",
      minimum: 1,
      description: "Exactly the LCD for every step",
    },
    expected_shaded: {
      type: "integer",
      minimum: 0,
      description: operation === "subtract"
        ? "Parts still shaded after any removal"
        : "Parts shaded in this addition state",
    },
    ...(operation === "subtract"
      ? { expected_removed: {
        type: "integer",
        minimum: 0,
        description: "Zero except in the middle take-away step; final step must be zero",
      } }
      : {}),
  } as const;
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", const: "fraction_bar" },
    operation: { type: "string", const: operation },
    misconception: { type: "string", const: misconceptionId },
    initial_state: {
      type: "object",
      additionalProperties: false,
      properties: {
        left: { type: "string", pattern: "^[0-9]+/[1-9][0-9]*$" },
        right: { type: "string", pattern: "^[0-9]+/[1-9][0-9]*$" },
      },
      required: ["left", "right"],
    },
    target: { type: "string", pattern: "^[0-9]+/[1-9][0-9]*$" },
    steps: {
      type: "array",
      minItems: operation === "subtract" ? 3 : 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: stepProperties,
        required: operation === "subtract"
          ? ["prompt", "expected_partitions", "expected_shaded", "expected_removed"]
          : ["prompt", "expected_partitions", "expected_shaded"],
      },
    },
  },
  required: ["type", "operation", "misconception", "initial_state", "target", "steps"],
  } as const;
}

function bareQuestionPattern(operation: FractionOperation): string {
  const operator = operation === "add" ? "\\+" : "[-−]";
  return `^\\s*[0-9]+\\s*/\\s*[1-9][0-9]*\\s*${operator}\\s*[0-9]+\\s*/\\s*[1-9][0-9]*\\s*$`;
}

export function practiceItemJsonSchemaFor(operation: FractionOperation) {
  const operationWord = operation === "add" ? "addition" : "subtraction";
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    question: {
      type: "string",
      description: `A bare fraction ${operationWord}`,
      minLength: 1,
      pattern: bareQuestionPattern(operation),
    },
    answer: {
      type: "string",
      description: "The reduced fraction answer in the form a/b",
      pattern: "^[0-9]+/[1-9][0-9]*$",
    },
    targetsMisconception: { type: "boolean", const: true },
  },
  required: ["question", "answer", "targetsMisconception"],
  } as const;
}

export const practiceItemJsonSchema = practiceItemJsonSchemaFor("add");

export function lessonPackJsonSchemaFor(
  misconceptionId: MisconceptionId,
  operation: FractionOperation = "add",
) {
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    operation: { type: "string", const: operation },
    misconception: { type: "string", const: misconceptionId },
    explanations: {
      type: "object",
      additionalProperties: false,
      properties: {
        scaffolded: explanationJsonSchema,
        core: explanationJsonSchema,
        extension: explanationJsonSchema,
      },
      required: ["scaffolded", "core", "extension"],
    },
    manipulative: fractionBarSpecJsonSchemaFor(misconceptionId, operation),
    practice: {
      type: "array",
      minItems: 4,
      maxItems: 5,
      items: practiceItemJsonSchemaFor(operation),
    },
    exitTicket: exitTicketJsonSchemaFor(operation),
  },
  required: ["operation", "misconception", "explanations", "manipulative", "practice", "exitTicket"],
  } as const;
}

export function exitTicketJsonSchemaFor(operation: FractionOperation) {
  const operationWord = operation === "add" ? "addition" : "subtraction";
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    question: {
      type: "string",
      description: `A bare fraction ${operationWord}`,
      minLength: 1,
      pattern: bareQuestionPattern(operation),
    },
    answer: { type: "string", pattern: "^[0-9]+/[1-9][0-9]*$" },
  },
  required: ["question", "answer"],
  } as const;
}

export const exitTicketJsonSchema = exitTicketJsonSchemaFor("add");

export function fractionsFromTranscription(transcription: string): [string, string] {
  const expression = parseFractionExpression(transcription);
  return [formatFraction(expression.left), formatFraction(expression.right)];
}

export function operationFromTranscription(transcription: string): FractionOperation {
  return parseFractionExpression(transcription).operation;
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
}

const INTERNAL_LANGUAGE_MARKERS = [
  "{",
  "}",
  "expected_partitions",
  "expected_shaded",
  "expected_removed",
  "initial_state",
  "targetsmisconception",
  "manipulative.",
] as const;

function assertTeacherFacingText(value: string, label: string): void {
  const normalized = value.toLowerCase();
  if (INTERNAL_LANGUAGE_MARKERS.some((marker) => normalized.includes(marker))) {
    throw new Error(
      `${label} contains internal implementation language; rewrite it in plain teacher language.`,
    );
  }
}

function validateExplanation(value: unknown, name: string): void {
  assertObject(value, name);
  if (typeof value.summary !== "string" || !value.summary.trim()) {
    throw new Error(`${name} needs a summary.`);
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > 6
    || value.steps.some((step) => typeof step !== "string" || !step.trim())) {
    throw new Error(`${name} needs one to six teaching steps.`);
  }
  assertTeacherFacingText(value.summary, name);
  value.steps.forEach((step) => {
    const sentence = step as string;
    assertTeacherFacingText(sentence, name);
    assertCleanExplanationStep(sentence, name);
  });
}

function assertCleanExplanationStep(step: string, name: string): void {
  const fractionCount = step.match(/\b\d+\s*\/\s*\d+\b/g)?.length ?? 0;
  const operationCount = step.match(/[+−-]/g)?.length ?? 0;
  const proseWordCount = step
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/[+−=\-]/g, " ")
    .match(/[A-Za-z]{3,}/g)?.length ?? 0;
  if (fractionCount >= 4 && operationCount >= 2 && proseWordCount < 4) {
    throw new Error(
      `${name} contains a list of practice problems or answers; rewrite it as a clean prose teaching sentence.`,
    );
  }
}

function parseBareQuestion(
  question: string,
  label: string,
  operation: FractionOperation,
): [Fraction, Fraction] {
  const operator = operation === "add" ? "\\+" : "[-−]";
  const match = question.trim().match(
    new RegExp(`^(\\d+\\s*\\/\\s*\\d+)\\s*${operator}\\s*(\\d+\\s*\\/\\s*\\d+)\\s*$`),
  );
  if (!match) {
    throw new Error(`${label} question must be a bare fraction ${operation === "add" ? "addition" : "subtraction"}: ${question}`);
  }
  return [parseFraction(match[1]), parseFraction(match[2])];
}

export function normalizedPracticeQuestionKey(
  question: string,
  operation: FractionOperation,
): string {
  const [left, right] = parseBareQuestion(question, "Practice", operation);
  const operands = [formatFraction(reduce(left)), formatFraction(reduce(right))];
  if (operation === "add") operands.sort();
  return `${operation}:${operands.join(":")}`;
}

function validateQuestionAnswer(
  question: unknown,
  answer: unknown,
  label: string,
  operation: FractionOperation,
  misconception?: string,
): void {
  if (typeof question !== "string" || typeof answer !== "string") {
    throw new Error(`${label} needs a question and answer.`);
  }
  assertTeacherFacingText(question, label);
  assertTeacherFacingText(answer, label);
  const [left, right] = parseBareQuestion(question, label, operation);
  if (left.denominator > 12 || right.denominator > 12) {
    throw new Error(`${label} denominators must be 12 or less.`);
  }
  const commonDenominator = lcm(left.denominator, right.denominator);
  if (commonDenominator > 12) {
    throw new Error(`${label} needs an LCD of 12 or less.`);
  }
  if (
    (misconception === "add_across"
      || misconception === "no_common_denominator"
      || misconception === "subtract_across"
      || misconception === "subtract_no_common_denominator")
    && left.denominator === right.denominator
  ) {
    throw new Error(`${label} must use unlike denominators to target this misconception.`);
  }
  if (operation === "subtract" && compareFractions(left, right) < 0) {
    throw new Error(`${label} subtraction must put the larger fraction first.`);
  }
  const expected = calculateFractions(left, right, operation);
  if (expected.numerator < 0 || expected.numerator > expected.denominator) {
    throw new Error(`${label} result must be between 0 and 1.`);
  }
  const supplied = parseFraction(answer);
  if (!equivalent(expected, supplied) || gcd(supplied.numerator, supplied.denominator) !== 1) {
    throw new Error(`${label} answer is not the correct reduced ${operation === "add" ? "sum" : "difference"}.`);
  }
}

export const FULL_SIZE_FRACTION_BAR_PARTITIONS = 12;
export const REDUCED_SIZE_FRACTION_BAR_PARTITIONS = 24;

export function fractionBarPartCount(leftText: string, rightText: string): number {
  const left = parseFraction(leftText);
  const right = parseFraction(rightText);
  return lcm(left.denominator, right.denominator);
}

export function validateLessonPack(value: unknown, diagnosis: Diagnosis): LessonPack {
  assertObject(value, "Lesson pack");
  const packId = typeof value.misconception === "string"
    ? normalizeMisconceptionId(value.misconception)
    : undefined;
  if (packId !== diagnosis.primary.id || value.operation !== diagnosis.operation) {
    throw new Error("Lesson pack does not match the confirmed operation and misconception.");
  }

  assertObject(value.explanations, "Explanations");
  validateExplanation(value.explanations.scaffolded, "Scaffolded explanation");
  validateExplanation(value.explanations.core, "Core explanation");
  validateExplanation(value.explanations.extension, "Extension explanation");

  assertObject(value.manipulative, "Manipulative");
  const manipulative = value.manipulative as unknown as FractionBarSpec;
  const manipulativeId = typeof manipulative.misconception === "string"
    ? normalizeMisconceptionId(manipulative.misconception)
    : undefined;
  if (manipulative.type !== "fraction_bar"
    || manipulativeId !== diagnosis.primary.id
    || manipulative.operation !== diagnosis.operation) {
    throw new Error("Manipulative does not target the confirmed misconception.");
  }
  const [diagnosedLeft, diagnosedRight] = fractionsFromTranscription(diagnosis.transcription);
  if (manipulative.initial_state?.left !== diagnosedLeft || manipulative.initial_state?.right !== diagnosedRight) {
    throw new Error("Manipulative must use the diagnosed problem fractions.");
  }
  const left = parseFraction(diagnosedLeft);
  const right = parseFraction(diagnosedRight);
  const lcd = lcm(left.denominator, right.denominator);
  const leftAtLcd = left.numerator * (lcd / left.denominator);
  const rightAtLcd = right.numerator * (lcd / right.denominator);
  if (diagnosis.operation === "subtract" && compareFractions(left, right) < 0) {
    throw new Error("Manipulative subtraction must put the larger fraction first.");
  }
  const correct = calculateFractions(left, right, diagnosis.operation);
  const finalShaded = diagnosis.operation === "add"
    ? leftAtLcd + rightAtLcd
    : leftAtLcd - rightAtLcd;
  if (finalShaded > lcd) {
    throw new Error("This fraction bar supports sums no greater than one whole.");
  }
  if (correct.numerator < 0 || correct.numerator > correct.denominator) {
    throw new Error("Manipulative result must be between 0 and 1.");
  }
  {
    if (!Array.isArray(manipulative.steps) || manipulative.steps.length === 0) {
      throw new Error("Manipulative needs at least one step.");
    }
    for (const step of manipulative.steps) {
      if (step && typeof step.prompt === "string") {
        assertTeacherFacingText(step.prompt, "Manipulative");
      }
      if (!step || typeof step.prompt !== "string" || !step.prompt.trim()
        || step.expected_partitions !== lcd
        || !Number.isInteger(step.expected_shaded)
        || step.expected_shaded < 0
        || step.expected_shaded > lcd
        || (diagnosis.operation === "subtract" && (
          !Number.isInteger(step.expected_removed)
          || step.expected_removed! < 0
          || step.expected_removed! > lcd
        ))
        || (diagnosis.operation === "add" && step.expected_removed !== undefined)) {
        throw new Error("Every manipulative step must use the LCD with a valid shaded count.");
      }
    }
    if (diagnosis.operation === "subtract") {
      const firstStep = manipulative.steps[0];
      const hasRemovalStep = manipulative.steps.some((step) =>
        step.expected_removed === rightAtLcd
        && step.expected_shaded === finalShaded
        && step.expected_shaded + step.expected_removed === leftAtLcd
      );
      if (manipulative.steps.length < 3
        || firstStep.expected_shaded !== leftAtLcd
        || firstStep.expected_removed !== 0
        || !hasRemovalStep) {
        throw new Error("Manipulative subtraction must shade the larger fraction, mark the amount removed, then show the remainder.");
      }
    }
    const finalStep = manipulative.steps[manipulative.steps.length - 1];
    if (finalStep.expected_shaded !== finalShaded
      || (diagnosis.operation === "subtract" && finalStep.expected_removed !== 0)) {
      throw new Error(`Manipulative final shading does not equal the correct ${diagnosis.operation === "add" ? "sum" : "remainder"}.`);
    }
  }
  const target = parseFraction(manipulative.target);
  if (!equivalent(target, correct) || gcd(target.numerator, target.denominator) !== 1) {
    throw new Error(`Manipulative target is not the correct reduced ${diagnosis.operation === "add" ? "sum" : "difference"}.`);
  }

  if (!Array.isArray(value.practice) || value.practice.length < 4 || value.practice.length > 5) {
    throw new Error("Lesson pack needs four to five distinct practice questions.");
  }
  const seenPractice = new Map<string, number>();
  value.practice.forEach((item, index) => {
    assertObject(item, `Practice item ${index + 1}`);
    if (item.targetsMisconception !== true) {
      throw new Error(`Practice item ${index + 1} must target the confirmed misconception.`);
    }
    validateQuestionAnswer(
      item.question,
      item.answer,
      `Practice item ${index + 1}`,
      diagnosis.operation,
      diagnosis.primary.id,
    );
    const normalizedQuestion = normalizedPracticeQuestionKey(
      item.question as string,
      diagnosis.operation,
    );
    const firstIndex = seenPractice.get(normalizedQuestion);
    if (firstIndex !== undefined) {
      throw new Error(
        `Practice item ${index + 1} duplicates Practice item ${firstIndex + 1}; every practice question must be distinct.`,
      );
    }
    seenPractice.set(normalizedQuestion, index);
  });

  assertObject(value.exitTicket, "Exit ticket");
  validateQuestionAnswer(
    value.exitTicket.question,
    value.exitTicket.answer,
    "Exit ticket",
    diagnosis.operation,
  );
  return {
    ...(value as unknown as LessonPack),
    operation: diagnosis.operation,
    misconception: packId,
    manipulative: {
      ...manipulative,
      misconception: manipulativeId,
    },
  };
}
