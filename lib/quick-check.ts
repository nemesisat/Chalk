import type { AlternativeId, Diagnosis } from "./diagnosis";
import {
  calculateFractions,
  formatFraction,
  operationSymbol,
  parseFractionExpression,
} from "./fraction-math";

export type QuickCheckCause = Extract<AlternativeId, "careless_slip" | "misread_operation">;

export type QuickCheckPack = {
  cause: QuickCheckCause;
  label: string;
  summary: string;
  practice: { question: string; answer: string }[];
};

export function isQuickCheckCause(value: AlternativeId): value is QuickCheckCause {
  return value === "careless_slip" || value === "misread_operation";
}

export function buildQuickCheck(diagnosis: Diagnosis, cause: QuickCheckCause): QuickCheckPack {
  const expression = parseFractionExpression(diagnosis.transcription);
  const symbol = operationSymbol(expression.operation);
  const transfer = expression.operation === "add"
    ? { question: "1/2 + 1/4", answer: "3/4" }
    : { question: "3/4 − 1/2", answer: "1/4" };
  return {
    cause,
    label: cause === "careless_slip"
      ? "Looks like a slip — quick check"
      : "Looks like a misread — quick check",
    summary: cause === "careless_slip"
      ? "Ask the student to retry independently, then use one transfer item to confirm the method is secure."
      : "Ask the student to name and circle the operation before solving, then check one transfer item.",
    practice: [
      {
        question: `${formatFraction(expression.left)} ${symbol} ${formatFraction(expression.right)}`,
        answer: formatFraction(calculateFractions(
          expression.left,
          expression.right,
          expression.operation,
        )),
      },
      transfer,
    ],
  };
}
