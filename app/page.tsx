"use client";

import { ChangeEvent, useState, useTransition } from "react";
import {
  Check,
  FileUp,
  LockKeyhole,
  Printer,
  RotateCcw,
} from "lucide-react";
import { diagnose } from "./actions/diagnose";
import { CyclingStatusText } from "../components/CyclingStatusText";
import { DiagnosisCard } from "../components/DiagnosisCard";
import {
  DiagnosisLoadingPanel,
  DIAGNOSIS_LOADING_MESSAGES,
} from "../components/DiagnosisLoadingPanel";
import { ProgressiveLessonBuilder } from "../components/ProgressiveLessonBuilder";
import {
  diagnosisForSelectedHypothesis,
  type AlternativeId,
  type Diagnosis,
} from "../lib/diagnosis";
import { isSupportedLessonMisconception } from "../lib/misconceptions";
import {
  buildQuickCheck,
  isQuickCheckCause,
  type QuickCheckPack,
} from "../lib/quick-check";

const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [injectVerificationFault, setInjectVerificationFault] = useState(false);
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState<Diagnosis | null>(null);
  const [quickCheck, setQuickCheck] = useState<QuickCheckPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const diagnosisPending = isDiagnosing || isPending;

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setDiagnosis(null);
    setConfirmed(false);
    setConfirmedDiagnosis(null);
    setQuickCheck(null);

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setError("Choose a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }

    try {
      setImageDataUrl(await readAsDataUrl(file));
      setFileName(file.name);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }
  }

  async function loadSample(sample: "add" | "subtract") {
    setError(null);
    setDiagnosis(null);
    setConfirmed(false);
    setConfirmedDiagnosis(null);
    setQuickCheck(null);
    try {
      const sampleFile = sample === "add"
        ? "sample-1-3-plus-1-4.png"
        : "sample-3-4-minus-1-3.png";
      const response = await fetch(`/${sampleFile}`);
      if (!response.ok) throw new Error("The sample image could not be loaded.");
      setImageDataUrl(await readAsDataUrl(await response.blob()));
      setFileName(sampleFile);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "The sample could not be loaded.");
    }
  }

  function runDiagnosis() {
    if (!imageDataUrl) return;
    setError(null);
    setDiagnosis(null);
    setConfirmed(false);
    setConfirmedDiagnosis(null);
    setQuickCheck(null);
    setIsDiagnosing(true);
    startTransition(async () => {
      try {
        setDiagnosis(await diagnose(imageDataUrl));
      } catch (diagnosisError) {
        setError(
          diagnosisError instanceof Error
            ? diagnosisError.message
            : "The work could not be diagnosed. Please try again.",
        );
      } finally {
        setIsDiagnosing(false);
      }
    });
  }

  function confirmAndBuildLesson(selectedId: AlternativeId) {
    if (!diagnosis) return;
    setConfirmed(true);
    setConfirmedDiagnosis(null);
    setQuickCheck(null);
    setError(null);

    if (isQuickCheckCause(selectedId)) {
      setQuickCheck(buildQuickCheck(diagnosis, selectedId));
      return;
    }
    if (!isSupportedLessonMisconception(selectedId, diagnosis.operation)) {
      setError("This operation and hypothesis are coming soon.");
      setConfirmed(false);
      return;
    }

    const selectedDiagnosis = diagnosisForSelectedHypothesis(diagnosis, selectedId);
    setConfirmedDiagnosis(selectedDiagnosis);
  }

  function reset() {
    setImageDataUrl(null);
    setFileName("");
    setDiagnosis(null);
    setConfirmed(false);
    setConfirmedDiagnosis(null);
    setQuickCheck(null);
    setError(null);
  }

  return (
    <main>
      <nav className="topbar shell">
        <div className="brand"><span className="brandmark">c</span> chalk</div>
        <div className="privacy"><LockKeyhole size={14} /> Server-side analysis · nothing saved</div>
      </nav>
      <div className="shell">
        <section className="hero">
          <div className="eyebrow">Teacher intelligence for fractions</div>
          <h1>The next lesson is hiding in the mistake.</h1>
          <p>Upload handwritten fraction work, review a careful hypothesis, then confirm the teaching move yourself.</p>
        </section>

        <section className="workspace">
          <div className="card capture">
            <div className="eyebrow">01 / Bring the work</div>
            <h2>What did your student try?</h2>
            <p className="muted">Use synthetic or consented work without a student name. The image is processed in memory and is not persisted.</p>
            <label className="drop" htmlFor="upload-photo">
              <div className="upload-icon"><FileUp size={20} /></div>
              {imageDataUrl ? <><strong>{fileName}</strong><span>Ready for private, server-side diagnosis</span></> : <><strong>Choose a photo of the work</strong><span>JPEG, PNG, or WEBP · up to 10 MB</span></>}
              <input id="upload-photo" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} />
            </label>
            <div className="sample-buttons" aria-label="Synthetic sample work">
              <button className="sample-button" type="button" disabled={diagnosisPending} onClick={() => loadSample("add")}>
                Try addition: 1/3 + 1/4
              </button>
              <button className="sample-button" type="button" disabled={diagnosisPending} onClick={() => loadSample("subtract")}>
                Try subtraction: 3/4 − 1/3
              </button>
            </div>
            {imageDataUrl && <img className="work-preview" src={imageDataUrl} alt="Uploaded handwritten fraction work" />}
            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="primary full" disabled={!imageDataUrl || diagnosisPending} onClick={runDiagnosis}>
              {diagnosisPending ? <CyclingStatusText messages={DIAGNOSIS_LOADING_MESSAGES} /> : "Diagnose this work"}
            </button>
            {IS_DEVELOPMENT && (
              <label className="verification-demo-toggle">
                <input
                  type="checkbox"
                  checked={injectVerificationFault}
                  onChange={(event) => setInjectVerificationFault(event.target.checked)}
                />
                <span><strong>Demo repair cycle</strong><small>Inject one wrong target before verification</small></span>
              </label>
            )}
          </div>

          {diagnosisPending ? (
            <DiagnosisLoadingPanel />
          ) : diagnosis ? (
            <DiagnosisCard diagnosis={diagnosis} imageSrc={imageDataUrl!} onConfirm={confirmAndBuildLesson} onReset={reset} />
          ) : (
            <div className="card diagnosis" aria-live="polite">
              <div className="status"><span className="dot" />Ready when you are</div>
              <h2>A careful read, not a label.</h2>
              <p className="muted">Chalk transcribes the work, maps evidence to a fixed misconception library, and gives you the final say.</p>
              <div className="evidence">A wrong answer can be a misconception, a careless slip, a misread operation, or unreadable work. Low-confidence cases are surfaced honestly.</div>
            </div>
          )}

          {confirmed && confirmedDiagnosis && (
            <ProgressiveLessonBuilder
              diagnosis={confirmedDiagnosis}
              injectVerificationFault={IS_DEVELOPMENT && injectVerificationFault}
              onBack={() => { setConfirmed(false); setConfirmedDiagnosis(null); }}
            />
          )}

          {confirmed && quickCheck && (
            <div className="card lesson quick-check-pack">
              <div className="lesson-head"><div><div className="eyebrow">02 / Teacher-confirmed quick check</div><h2>{quickCheck.label}</h2><p className="muted">No misconception re-teach has been generated.</p></div><span className="pill"><Check size={12} /> QUICK CHECK</span></div>
              <section className="quick-check-core"><div className="label">Core check only</div><p>{quickCheck.summary}</p><ol className="practice-list">{quickCheck.practice.map((item) => <li key={item.question}><strong>{item.question}</strong><span>Answer: {item.answer}</span></li>)}</ol></section>
              <div className="lesson-actions"><button className="secondary" onClick={() => { setConfirmed(false); setQuickCheck(null); }}><RotateCcw size={14} /> Edit confirmation</button><button className="print" onClick={() => window.print()}><Printer size={14} /> Print quick check</button></div>
            </div>
          )}
        </section>
        <footer className="footer"><span>Chalk assists a teacher. It never autonomously grades or labels a child.</span><span>EXIF stripped server-side · store: false</span></footer>
      </div>
    </main>
  );
}
