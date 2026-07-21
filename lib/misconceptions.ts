import type { FractionOperation } from "../types";

export const MISCONCEPTIONS = {
  add_across: {
    id: "add_across",
    label: "Adding numerators and denominators directly",
    tell: "added top and bottom separately",
    teacherCheckQuestion:
      "What does the denominator tell us about the size of each piece?",
  },
  no_common_denominator: {
    id: "no_common_denominator",
    label: "Adding without a common denominator",
    tell: "combined unlike pieces without converting",
    teacherCheckQuestion: "Are these pieces the same size?",
  },
  subtract_across: {
    id: "subtract_across",
    label: "Subtracting numerators and denominators directly",
    tell: "subtracted the bottom numbers as well as the top numbers",
    teacherCheckQuestion:
      "What must be true about the size of the pieces before we subtract them?",
  },
  subtract_no_common_denominator: {
    id: "subtract_no_common_denominator",
    label: "Subtracting without a common denominator",
    tell: "took away unlike-sized pieces without renaming them",
    teacherCheckQuestion: "Are the pieces the same size before we take any away?",
  },
  invert_wrong_operand: {
    id: "invert_wrong_operand",
    label: "Inverting the wrong number when dividing",
    tell: "flipped the dividend, not the divisor",
    teacherCheckQuestion: "Which fraction should we flip when we divide?",
  },
  num_denom_meaning: {
    id: "num_denom_meaning",
    label: "Treating numerator and denominator as unrelated whole numbers",
    tell: "operated on top and bottom independently",
    teacherCheckQuestion: "What does the bottom number mean?",
  },
  bigger_denominator_bigger: {
    id: "bigger_denominator_bigger",
    label: "Thinking a bigger denominator means a bigger fraction",
    tell: "ranked 1/8 > 1/4",
    teacherCheckQuestion:
      "If we cut a pizza into more slices, is each slice bigger or smaller?",
  },
} as const;

export type MisconceptionId = keyof typeof MISCONCEPTIONS;

export const ADDITION_MISCONCEPTION_IDS = [
  "add_across",
  "no_common_denominator",
  "num_denom_meaning",
] as const satisfies readonly MisconceptionId[];

export type AdditionMisconceptionId = (typeof ADDITION_MISCONCEPTION_IDS)[number];

export const SUBTRACTION_MISCONCEPTION_IDS = [
  "subtract_across",
  "subtract_no_common_denominator",
  "num_denom_meaning",
] as const satisfies readonly MisconceptionId[];

export type SubtractionMisconceptionId = (typeof SUBTRACTION_MISCONCEPTION_IDS)[number];

const additionIdSet = new Set<string>(ADDITION_MISCONCEPTION_IDS);
const subtractionIdSet = new Set<string>(SUBTRACTION_MISCONCEPTION_IDS);

export function isAdditionMisconceptionId(value: string): value is AdditionMisconceptionId {
  return additionIdSet.has(value);
}

export function isSubtractionMisconceptionId(value: string): value is SubtractionMisconceptionId {
  return subtractionIdSet.has(value);
}

export function isSupportedLessonMisconception(
  value: string,
  operation: FractionOperation,
): value is AdditionMisconceptionId | SubtractionMisconceptionId {
  return operation === "add"
    ? isAdditionMisconceptionId(value)
    : isSubtractionMisconceptionId(value);
}

export const MISCONCEPTION_IDS = Object.keys(
  MISCONCEPTIONS,
) as MisconceptionId[];

export function isMisconceptionId(value: string): value is MisconceptionId {
  return value in MISCONCEPTIONS;
}

export function misconceptionPromptLibrary(): string {
  return MISCONCEPTION_IDS.map((id) => {
    const item = MISCONCEPTIONS[id];
    return `${item.id}: ${item.label}; tell: ${item.tell}; check: ${item.teacherCheckQuestion}`;
  }).join("\n");
}
