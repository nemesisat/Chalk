"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import type { AlternativeId, Diagnosis } from "../lib/diagnosis";
import {
  MISCONCEPTIONS,
  isMisconceptionId,
  isSupportedLessonMisconception,
} from "../lib/misconceptions";

type DiagnosisCardProps = {
  diagnosis: Diagnosis;
  imageSrc: string;
  onConfirm: (selectedId: AlternativeId) => void;
  onReset: () => void;
};

export type ConfidenceBand = "High" | "Medium" | "Low";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 80) return "High";
  if (confidence >= 60) return "Medium";
  return "Low";
}

export function DiagnosisCard({
  diagnosis,
  imageSrc,
  onConfirm,
  onReset,
}: DiagnosisCardProps) {
  const [selectedId, setSelectedId] = useState<AlternativeId>(diagnosis.primary.id);
  const [imageOpen, setImageOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const thumbnailButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setSelectedId(diagnosis.primary.id), [diagnosis]);
  useEffect(() => {
    if (imageOpen) closeButtonRef.current?.focus();
  }, [imageOpen]);

  const hypotheses = [diagnosis.primary, ...diagnosis.alternatives];
  const selected = hypotheses.find((item) => item.id === selectedId) ?? diagnosis.primary;
  const band = confidenceBand(diagnosis.confidence);
  const isQuickCheck = selectedId === "careless_slip" || selectedId === "misread_operation";
  const isFullLesson = isSupportedLessonMisconception(selectedId, diagnosis.operation);
  const canConfirm = isQuickCheck || isFullLesson;
  const isComingSoon = isMisconceptionId(selectedId) && !isFullLesson;
  const checkQuestion = isMisconceptionId(selectedId)
    ? MISCONCEPTIONS[selectedId].teacherCheckQuestion
    : selectedId === "careless_slip"
      ? "Can the student solve one similar problem correctly without prompting?"
      : selectedId === "misread_operation"
        ? "What operation sign do you see, and what does it ask you to do?"
        : "Can the student rewrite the work clearly enough to review?";

  function closeImage() {
    setImageOpen(false);
    requestAnimationFrame(() => thumbnailButtonRef.current?.focus());
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeImage();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      closeButtonRef.current?.focus();
    }
  }

  return (
    <div className="card diagnosis">
      <div className="status">
        <span className="dot" /> Diagnosis complete · teacher review required
      </div>
      <h2>Likely explanation</h2>
      <h3 aria-live="polite">{selected.label}</h3>

      <div className="label">Transcription</div>
      <div className="transcription-row">
        <button
          ref={thumbnailButtonRef}
          type="button"
          className="thumbnail-button"
          aria-label="Open the uploaded work at full size"
          aria-haspopup="dialog"
          onClick={() => setImageOpen(true)}
        >
          <img src={imageSrc} alt="Thumbnail of the uploaded handwritten work" />
        </button>
        <div className="transcription-text">{diagnosis.transcription}</div>
      </div>

      <div className="label">Evidence in the work</div>
      <div className="evidence evidence-tokens">{diagnosis.evidence.join(" · ")}</div>

      <div className="confidence">
        <div className="label">Confidence · {band} · {diagnosis.confidence}%</div>
        <div
          className="bar"
          role="progressbar"
          aria-label={`${band} confidence`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={diagnosis.confidence}
        >
          <i style={{ width: `${diagnosis.confidence}%` }} />
        </div>
      </div>

      <div className="label">Working hypothesis</div>
      <div className="alternatives" aria-label="Choose the working hypothesis">
        {hypotheses.map((hypothesis) => {
          const unavailable = isMisconceptionId(hypothesis.id)
            && !isSupportedLessonMisconception(hypothesis.id, diagnosis.operation);
          return (
          <button
            type="button"
            className="alt hypothesis-chip"
            key={hypothesis.id}
            aria-pressed={hypothesis.id === selectedId}
            aria-describedby={unavailable ? `${hypothesis.id}-availability` : undefined}
            onClick={() => setSelectedId(hypothesis.id)}
          >
            {hypothesis.label}
            {unavailable && (
              <span className="coming-soon" id={`${hypothesis.id}-availability`}>
                {hypothesis.id === "invert_wrong_operand" ? "Division · coming soon" : "Coming soon"}
              </span>
            )}
          </button>
          );
        })}
      </div>

      <div className="check">
        <div className="label">Teacher check-question</div>
        <strong>{checkQuestion}</strong>
      </div>
      {isComingSoon && <p className="availability-note" role="status">This submission generates addition and subtraction lessons. Division and comparison support are coming soon.</p>}
      <div className="confirm">
        <button className="primary" disabled={!canConfirm} onClick={() => onConfirm(selectedId)}>
          {isQuickCheck ? "Confirm & build quick check" : "Confirm & build lesson"}
        </button>
        <button className="secondary" onClick={onReset}>Review again</button>
      </div>

      {imageOpen && (
        <div
          className="image-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uploaded-work-title"
          onKeyDown={handleDialogKeyDown}
        >
          <div className="image-dialog-panel">
            <div className="image-dialog-header">
              <h2 id="uploaded-work-title">Uploaded student work</h2>
              <button ref={closeButtonRef} type="button" className="secondary" onClick={closeImage}>Close</button>
            </div>
            <img src={imageSrc} alt="Full-size uploaded handwritten fraction work" />
          </div>
        </div>
      )}
    </div>
  );
}
