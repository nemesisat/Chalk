import {
  MISCONCEPTION_IDS,
  MISCONCEPTIONS,
  isMisconceptionId,
  isSupportedLessonMisconception,
  type MisconceptionId,
} from "./misconceptions";
import { parseFractionExpression } from "./fraction-math";
import type { FractionOperation } from "../types";

export const ALTERNATIVE_IDS = [
  ...MISCONCEPTION_IDS,
  "careless_slip",
  "misread_operation",
  "unreadable_work",
] as const;

export type AlternativeId = (typeof ALTERNATIVE_IDS)[number];

export type DiagnosisAlternative = {
  id: AlternativeId;
  label: string;
  explanation: string;
};

export type Diagnosis = {
  operation: FractionOperation;
  transcription: string;
  primary: {
    id: MisconceptionId;
    label: string;
  };
  confidence: number;
  evidence: string[];
  alternatives: DiagnosisAlternative[];
  teacherCheckQuestion: string;
};

export function normalizeMisconceptionId(value: string): MisconceptionId | undefined {
  if (isMisconceptionId(value)) return value;
  return MISCONCEPTION_IDS.find((id) => MISCONCEPTIONS[id].label === value);
}

export const diagnosisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    operation: { type: "string", enum: ["add", "subtract"] },
    transcription: { type: "string", minLength: 1 },
    primary: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", enum: MISCONCEPTION_IDS },
        label: {
          type: "string",
          enum: MISCONCEPTION_IDS.map((id) => MISCONCEPTIONS[id].label),
        },
      },
      required: ["id", "label"],
    },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", minLength: 1 },
    },
    alternatives: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: ALTERNATIVE_IDS },
          label: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["id", "label", "explanation"],
      },
    },
    teacherCheckQuestion: { type: "string" },
  },
  required: [
    "operation",
    "transcription",
    "primary",
    "confidence",
    "evidence",
    "alternatives",
    "teacherCheckQuestion",
  ],
} as const;

const alternativeIdSet = new Set<string>(ALTERNATIVE_IDS);

const DISTINCT_CAUSE_ALTERNATIVES: readonly DiagnosisAlternative[] = [
  {
    id: "careless_slip",
    label: "Careless slip (knows the method)",
    explanation: "The student may know the method and have made a one-off arithmetic slip.",
  },
  {
    id: "misread_operation",
    label: "Misread the operation",
    explanation: "The student may have read the operation sign incorrectly.",
  },
] as const;

function misconceptionForOperation(
  id: MisconceptionId,
  operation: FractionOperation,
): MisconceptionId {
  if (operation === "subtract") {
    if (id === "add_across") return "subtract_across";
    if (id === "no_common_denominator") return "subtract_no_common_denominator";
  } else {
    if (id === "subtract_across") return "add_across";
    if (id === "subtract_no_common_denominator") return "no_common_denominator";
  }
  return id;
}

export function validateAndNormalizeDiagnosis(value: unknown): Diagnosis {
  if (!value || typeof value !== "object") {
    throw new Error("The diagnosis response was not an object.");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.transcription !== "string" || !candidate.transcription.trim()) {
    throw new Error("The diagnosis did not include a transcription.");
  }
  const transcription = candidate.transcription.trim();
  const operation = parseFractionExpression(transcription).operation;
  const primary = candidate.primary as Record<string, unknown> | undefined;
  const rawId = primary?.id;
  const normalizedId = typeof rawId === "string" ? normalizeMisconceptionId(rawId) : undefined;
  const id = normalizedId ? misconceptionForOperation(normalizedId, operation) : undefined;
  if (!id) {
    throw new Error("The diagnosis selected an unknown misconception.");
  }

  if (
    !Number.isInteger(candidate.confidence) ||
    (candidate.confidence as number) < 0 ||
    (candidate.confidence as number) > 100
  ) {
    throw new Error("The diagnosis confidence must be an integer from 0 to 100.");
  }

  if (
    !Array.isArray(candidate.evidence) ||
    candidate.evidence.length === 0 ||
    candidate.evidence.length > 4 ||
    candidate.evidence.some(
      (item) => typeof item !== "string" || !item.trim(),
    )
  ) {
    throw new Error("The diagnosis evidence must contain short verbatim tokens.");
  }

  if (!Array.isArray(candidate.alternatives) || candidate.alternatives.length !== 2) {
    throw new Error("The diagnosis must contain exactly two alternatives.");
  }

  const seen = new Set<string>();
  const validatedAlternatives = candidate.alternatives.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Each alternative must be an object.");
    }
    const alternative = item as Record<string, unknown>;
    if (
      typeof alternative.id !== "string" ||
      !alternativeIdSet.has(alternative.id) ||
      alternative.id === id ||
      seen.has(alternative.id) ||
      typeof alternative.label !== "string" ||
      typeof alternative.explanation !== "string"
    ) {
      throw new Error("Alternatives must be valid, unique, and different from the primary.");
    }
    seen.add(alternative.id);
    const alternativeId = isMisconceptionId(alternative.id)
      ? misconceptionForOperation(alternative.id, operation)
      : alternative.id as AlternativeId;
    return {
      id: alternativeId,
      label: isMisconceptionId(alternativeId)
        ? MISCONCEPTIONS[alternativeId].label
        : alternative.label,
      explanation: alternative.explanation,
    };
  });

  // For an add-across primary, no_common_denominator describes the same visible
  // act rather than a genuinely different cause. Keep alternatives useful to a
  // teacher by replacing that overlap with a trusted non-misconception cause.
  const overlappingAlternative = id === "add_across"
    ? "no_common_denominator"
    : id === "subtract_across"
      ? "subtract_no_common_denominator"
      : null;
  const alternatives = validatedAlternatives.filter((alternative, index, all) =>
    alternative.id !== id
    && alternative.id !== overlappingAlternative
    && all.findIndex((candidateAlternative) => candidateAlternative.id === alternative.id) === index
  );
  for (const fallback of DISTINCT_CAUSE_ALTERNATIVES) {
    if (alternatives.length >= 2) break;
    if (fallback.id !== id && !alternatives.some((item) => item.id === fallback.id)) {
      alternatives.push({ ...fallback });
    }
  }
  if (alternatives.length !== 2) {
    throw new Error("The diagnosis needs two genuinely different alternatives.");
  }

  const libraryEntry = MISCONCEPTIONS[id];
  return {
    operation,
    transcription,
    primary: { id, label: libraryEntry.label },
    confidence: candidate.confidence as number,
    evidence: candidate.evidence.map((item) => (item as string).trim()),
    alternatives,
    teacherCheckQuestion: libraryEntry.teacherCheckQuestion,
  };
}

export function diagnosisForSelectedHypothesis(
  diagnosis: Diagnosis,
  selectedId: AlternativeId,
): Diagnosis {
  const selectedMisconceptionId = normalizeMisconceptionId(selectedId);
  if (!selectedMisconceptionId
    || !isSupportedLessonMisconception(selectedMisconceptionId, diagnosis.operation)) {
    throw new Error("Only a library misconception supported for this operation can generate a full lesson pack.");
  }
  if (selectedMisconceptionId === diagnosis.primary.id) {
    return validateAndNormalizeDiagnosis(diagnosis);
  }

  const selected = diagnosis.alternatives.find((item) => item.id === selectedMisconceptionId);
  if (!selected) throw new Error("The selected hypothesis is not part of this diagnosis.");
  const alternatives: DiagnosisAlternative[] = [
    {
      id: diagnosis.primary.id,
      label: diagnosis.primary.label,
      explanation: "This was the model's original primary hypothesis.",
    },
    ...diagnosis.alternatives.filter((item) => item.id !== selectedMisconceptionId),
  ].slice(0, 2);

  return validateAndNormalizeDiagnosis({
    ...diagnosis,
    primary: { id: selectedMisconceptionId, label: selected.label },
    alternatives,
  });
}
