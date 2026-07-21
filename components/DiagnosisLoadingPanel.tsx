"use client";

import { CyclingStatusText } from "./CyclingStatusText";

export const DIAGNOSIS_LOADING_MESSAGES = [
  "Reading the handwriting…",
  "Looking for the pattern in the mistake…",
  "Consulting the misconception library…",
] as const;

const SKELETON_ROWS = [
  { label: "Transcription", lines: 1 },
  { label: "Evidence", lines: 2 },
  { label: "Confidence", lines: 1 },
] as const;

export function DiagnosisLoadingPanel() {
  return (
    <div
      className="card diagnosis diagnosis-loading-panel"
      role="region"
      aria-label="Diagnosis in progress"
      aria-busy="true"
    >
      <div className="diagnosis-loading-status" role="status" aria-live="polite">
        <span className="diagnosis-loading-spinner" aria-hidden="true" />
        <CyclingStatusText messages={DIAGNOSIS_LOADING_MESSAGES} />
      </div>
      <h2>Building the diagnosis carefully.</h2>
      <div className="diagnosis-loading-rows" aria-hidden="true">
        {SKELETON_ROWS.map((row) => (
          <div className="diagnosis-loading-row" key={row.label}>
            <span className="diagnosis-loading-label">{row.label}</span>
            <div className="diagnosis-loading-lines">
              {Array.from({ length: row.lines }, (_, index) => (
                <span
                  className={`diagnosis-loading-line${index === row.lines - 1 && row.lines > 1 ? " short" : ""}`}
                  key={index}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
