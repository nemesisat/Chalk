import type { Diagnosis } from "./diagnosis";
import {
  exitTicketJsonSchemaFor,
  explanationJsonSchema,
  fractionBarSpecJsonSchemaFor,
  practiceItemJsonSchemaFor,
  validateLessonPack,
} from "./lesson";
import {
  extractResponseText,
  lessonArithmeticFacts,
  type LessonOpenAIClientLike,
} from "./generate-lesson-server";
import type { LessonPack, VerificationResult } from "../types";

const MAX_REPAIR_CYCLES = 3;

type ExplanationMode = keyof LessonPack["explanations"];
type RepairTarget =
  | { kind: "manipulative" }
  | { kind: "practice"; index: number }
  | { kind: "explanation"; mode: ExplanationMode }
  | { kind: "exitTicket" }
  | { kind: "packIdentity" };

function failedResult(repairCycles: number, notes: string[]): VerificationResult {
  return {
    passed: false,
    checks: {
      schema: false,
      numerical: 0,
      answerKey: 0,
      stateTransition: 0,
      misconceptionAlignment: false,
    },
    repairCycles,
    notes,
  };
}

function passedResult(pack: LessonPack, repairCycles: number, notes: string[]): VerificationResult {
  return {
    passed: true,
    checks: {
      schema: true,
      // Every rendered bar receives exact LCD/state checks plus reduced-target checks.
      numerical: pack.manipulative.steps.length + 2,
      answerKey: pack.practice.length + 1,
      stateTransition: pack.manipulative.steps.length,
      misconceptionAlignment: true,
    },
    repairCycles,
    notes,
  };
}

function repairTarget(error: string): RepairTarget | null {
  const practice = error.match(/^Practice item (\d+)/);
  if (practice) return { kind: "practice", index: Number(practice[1]) - 1 };
  if (error.startsWith("Exit ticket")) return { kind: "exitTicket" };
  if (error.startsWith("Scaffolded explanation")) {
    return { kind: "explanation", mode: "scaffolded" };
  }
  if (error.startsWith("Core explanation")) {
    return { kind: "explanation", mode: "core" };
  }
  if (error.startsWith("Extension explanation")) {
    return { kind: "explanation", mode: "extension" };
  }
  if (error === "Lesson pack does not match the confirmed operation and misconception.") {
    return { kind: "packIdentity" };
  }
  if (/manipulative|fraction bar|LCD/i.test(error)) return { kind: "manipulative" };
  return null;
}

function schemaFor(target: RepairTarget, diagnosis: Diagnosis): unknown {
  switch (target.kind) {
    case "manipulative":
      return fractionBarSpecJsonSchemaFor(diagnosis.primary.id, diagnosis.operation);
    case "practice":
      return practiceItemJsonSchemaFor(diagnosis.operation);
    case "explanation":
      return explanationJsonSchema;
    case "exitTicket":
      return exitTicketJsonSchemaFor(diagnosis.operation);
    case "packIdentity":
      return {
        type: "object",
        additionalProperties: false,
        properties: {
          operation: { type: "string", const: diagnosis.operation },
          misconception: { type: "string", const: diagnosis.primary.id },
        },
        required: ["operation", "misconception"],
      };
  }
}

function artifactFor(pack: LessonPack, target: RepairTarget): unknown {
  switch (target.kind) {
    case "manipulative": return pack.manipulative;
    case "practice": return pack.practice[target.index];
    case "explanation": return pack.explanations[target.mode];
    case "exitTicket": return pack.exitTicket;
    case "packIdentity": return {
      operation: pack.operation,
      misconception: pack.misconception,
    };
  }
}

function applyRepair(pack: LessonPack, target: RepairTarget, artifact: unknown): LessonPack {
  const repaired = structuredClone(pack);
  switch (target.kind) {
    case "manipulative":
      repaired.manipulative = artifact as LessonPack["manipulative"];
      break;
    case "practice":
      repaired.practice[target.index] = artifact as LessonPack["practice"][number];
      break;
    case "explanation":
      repaired.explanations[target.mode] = artifact as LessonPack["explanations"][ExplanationMode];
      break;
    case "exitTicket":
      repaired.exitTicket = artifact as LessonPack["exitTicket"];
      break;
    case "packIdentity": {
      const identity = artifact as { operation: LessonPack["operation"]; misconception: string };
      repaired.operation = identity.operation;
      repaired.misconception = identity.misconception;
      break;
    }
  }
  return repaired;
}

async function repairArtifact(
  pack: LessonPack,
  diagnosis: Diagnosis,
  target: RepairTarget,
  validatorError: string,
  client: LessonOpenAIClientLike,
): Promise<LessonPack> {
  const response = await client.responses.create({
    model: "gpt-5.6-sol",
    store: false,
    reasoning: { effort: "high" },
    instructions: `Repair only the supplied failing lesson artifact for fraction ${diagnosis.operation === "add" ? "addition" : "subtraction"}. Use the supplied arithmetic facts exactly; do not improvise counts. For subtraction return at least three ordered fraction-bar states: starting shade, take-away, then remainder. Explanation steps must be clean prose teaching sentences and must never contain lists of practice problems or answers. When repairing practice, choose a question different from every supplied question to avoid; reversed addends count as duplicates. Use plain teacher language in every human-facing string: never include JSON, field names, code, or internal flags. Practice and exit-ticket questions must be exactly bare fraction expressions using the confirmed operation, with no prose prefix. Preserve the teaching intent, satisfy the confirmed diagnosis, and return only the replacement structured object.`,
    input: JSON.stringify({
      validatorError,
      arithmeticFacts: lessonArithmeticFacts(diagnosis),
      confirmedDiagnosis: diagnosis,
      failingArtifact: artifactFor(pack, target),
      ...(target.kind === "practice"
        ? {
          questionsToAvoid: pack.practice
            .filter((_, index) => index !== target.index)
            .map((item) => item.question),
        }
        : {}),
    }),
    text: {
      format: {
        type: "json_schema",
        name: `chalk_repair_${target.kind}`,
        strict: true,
        schema: schemaFor(target, diagnosis),
      },
    },
  });
  const output = extractResponseText(response);
  if (!output) throw new Error("The repair model returned no artifact.");
  let artifact: unknown;
  try {
    artifact = JSON.parse(output);
  } catch {
    throw new Error("The repair model returned invalid JSON.");
  }
  return applyRepair(pack, target, artifact);
}

/**
 * The deterministic verifier, built with Codex, runs real assertions in
 * validateLessonPack. On failure GPT-5.6 repairs only the failing artifact,
 * then the same assertions run again. This is not runtime Codex-SDK execution.
 */
export async function verifyAndRepairWithClient(
  pack: LessonPack,
  diagnosis: Diagnosis,
  client: LessonOpenAIClientLike,
): Promise<{ pack: LessonPack; result: VerificationResult }> {
  let candidate = structuredClone(pack);
  const notes: string[] = [];
  let repairCycles = 0;

  while (true) {
    try {
      const verified = validateLessonPack(candidate, diagnosis);
      return { pack: verified, result: passedResult(verified, repairCycles, notes) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lesson validation failed.";
      notes.push(message);
      if (repairCycles >= MAX_REPAIR_CYCLES) {
        return { pack: candidate, result: failedResult(repairCycles, notes) };
      }
      const target = repairTarget(message);
      if (!target) {
        notes.push("The failing artifact could not be isolated for a safe repair.");
        return { pack: candidate, result: failedResult(repairCycles, notes) };
      }
      repairCycles += 1;
      try {
        candidate = await repairArtifact(candidate, diagnosis, target, message, client);
      } catch (repairError) {
        notes.push(
          repairError instanceof Error
            ? `Repair cycle ${repairCycles}: ${repairError.message}`
            : `Repair cycle ${repairCycles} failed.`,
        );
      }
    }
  }
}
