import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import type { VerificationResult } from "../types";

export function VerificationReceipt({ result }: { result: VerificationResult }) {
  const title = result.passed ? "Lesson verified" : "Needs teacher review";
  return (
    <details className={`verification-receipt ${result.passed ? "is-passed" : "is-failed"}`}>
      <summary>
        <span className="verification-icon" aria-hidden="true">
          {result.passed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        </span>
        <span>
          <strong>{title}</strong>
          <small>
            {result.passed
              ? `Verified after ${result.repairCycles} repair cycle${result.repairCycles === 1 ? "" : "s"}`
              : "The pack was not marked as verified"}
          </small>
        </span>
        <ChevronDown className="verification-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="verification-details">
        {result.passed ? (
          <ul>
            <li>{result.checks.numerical} numerical assertions passed</li>
            <li>{result.checks.answerKey} answer-key checks passed</li>
            <li>{result.checks.stateTransition} state transitions passed</li>
            <li>Misconception alignment passed</li>
            <li>Verified after {result.repairCycles} repair cycle{result.repairCycles === 1 ? "" : "s"}</li>
          </ul>
        ) : (
          <>
            <p>Review the validator notes before using this lesson.</p>
            <ul className="verification-notes">
              {result.notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
