"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Printer, RotateCcw, Sparkles } from "lucide-react";
import { generateLessonArtifact } from "../app/actions/generate-artifact";
import { generateLesson } from "../app/actions/generate";
import { verifyAndRepair } from "../app/actions/verify";
import type { Diagnosis } from "../lib/diagnosis";
import { operationSymbol } from "../lib/fraction-math";
import { injectBrokenTarget } from "../lib/verification-demo";
import type {
  FractionBarSpec,
  LessonArtifactKey,
  LessonArtifactMap,
  LessonPack,
  VerificationResult,
} from "../types";
import { FractionBar, validateFractionBarSpec } from "./FractionBar";
import { CyclingStatusText } from "./CyclingStatusText";
import { VerificationReceipt } from "./VerificationReceipt";

export const LESSON_ARTIFACT_KEYS: readonly LessonArtifactKey[] = [
  "scaffolded",
  "core",
  "extension",
  "manipulative",
  "practice",
  "exitTicket",
];

const LABELS: Record<LessonArtifactKey, string> = {
  scaffolded: "Scaffolded",
  core: "Core",
  extension: "Extension",
  manipulative: "Fraction bar",
  practice: "Practice",
  exitTicket: "Exit ticket",
};

const LOADING_MESSAGES: Record<LessonArtifactKey, readonly string[]> = {
  scaffolded: ["Breaking it into small steps…"],
  core: ["Writing the main explanation…"],
  extension: ["Adding a challenge…"],
  manipulative: ["Drawing equal parts…"],
  practice: ["Writing practice problems…", "Checking every answer…"],
  exitTicket: ["Planning the final check…"],
};

type GenerateArtifactFn = (
  diagnosis: Diagnosis,
  key: LessonArtifactKey,
) => Promise<LessonArtifactMap[LessonArtifactKey]>;
type VerifyFn = (
  pack: LessonPack,
  diagnosis: Diagnosis,
) => Promise<{ pack: LessonPack; result: VerificationResult }>;

type ProgressiveLessonBuilderProps = {
  diagnosis: Diagnosis;
  injectVerificationFault?: boolean;
  onBack: () => void;
  generateArtifactFn?: GenerateArtifactFn;
  verifyFn?: VerifyFn;
  singleShotFn?: (diagnosis: Diagnosis) => Promise<LessonPack>;
  progressiveEnabled?: boolean;
};

function assemblePack(
  sections: Partial<LessonArtifactMap>,
  diagnosis: Diagnosis,
): LessonPack | null {
  if (!LESSON_ARTIFACT_KEYS.every((key) => sections[key] !== undefined)) return null;
  return {
    operation: diagnosis.operation,
    misconception: diagnosis.primary.id,
    explanations: {
      scaffolded: sections.scaffolded!,
      core: sections.core!,
      extension: sections.extension!,
    },
    manipulative: sections.manipulative!,
    practice: sections.practice!,
    exitTicket: sections.exitTicket!,
  };
}

function sectionsFromPack(pack: LessonPack): LessonArtifactMap {
  return {
    scaffolded: pack.explanations.scaffolded,
    core: pack.explanations.core,
    extension: pack.explanations.extension,
    manipulative: pack.manipulative,
    practice: pack.practice,
    exitTicket: pack.exitTicket,
  };
}

export function DraftFractionBar({ spec }: { spec: FractionBarSpec }) {
  try {
    validateFractionBarSpec(spec);
    return <FractionBar spec={spec} />;
  } catch {
    return (
      <div className="draft-spec-summary">
        Draft received: {spec.initial_state?.left} {operationSymbol(spec.operation)} {spec.initial_state?.right} → {spec.target}
        <small>Checking the partitions before drawing the final bar.</small>
      </div>
    );
  }
}

function SectionSkeleton({ sectionKey }: { sectionKey: LessonArtifactKey }) {
  return (
    <div
      className="lesson-section-skeleton"
      role="status"
      aria-label={`${LABELS[sectionKey]} section is loading`}
    >
      <span className="section-loader" aria-hidden="true"><i /><i /><i /></span>
      <CyclingStatusText messages={LOADING_MESSAGES[sectionKey]} />
      <span className="skeleton-line wide" aria-hidden="true" />
      <span className="skeleton-line" aria-hidden="true" />
      <span className="skeleton-line short" aria-hidden="true" />
    </div>
  );
}

function LessonSection({
  sectionKey,
  value,
  error,
  verified,
  needsReview,
  onRetry,
}: {
  sectionKey: LessonArtifactKey;
  value?: LessonArtifactMap[LessonArtifactKey];
  error?: string;
  verified: boolean;
  needsReview: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className={`progressive-section progressive-${sectionKey}`}
      aria-live="polite"
      aria-label={`${LABELS[sectionKey]} lesson section`}
    >
      <div className="progressive-section-head">
        <div className="label">{LABELS[sectionKey]}</div>
        {!verified && value && (
          <span className={`draft-tag ${needsReview ? "needs-review" : ""}`}>
            {needsReview ? "DRAFT · teacher review" : "DRAFT · checking…"}
          </span>
        )}
      </div>
      {error ? (
        <div className="section-error" role="alert">
          <strong>This section paused.</strong>
          <span>{error}</span>
          <button type="button" className="section-retry" onClick={onRetry}>Retry {LABELS[sectionKey]}</button>
        </div>
      ) : !value ? (
        <SectionSkeleton sectionKey={sectionKey} />
      ) : sectionKey === "scaffolded" || sectionKey === "core" || sectionKey === "extension" ? (
        <>
          <h3>{(value as LessonArtifactMap["core"]).summary}</h3>
          <ol>{(value as LessonArtifactMap["core"]).steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </>
      ) : sectionKey === "manipulative" ? (
        <DraftFractionBar spec={value as FractionBarSpec} />
      ) : sectionKey === "practice" ? (
        <ol className="practice-list">
          {(value as LessonArtifactMap["practice"]).map((item, index) => (
            <li key={`${item.question}-${index}`}><strong>{item.question}</strong><span>Answer: {item.answer}</span></li>
          ))}
        </ol>
      ) : (
        <div className="exit-ticket-content">
          <strong>{(value as LessonArtifactMap["exitTicket"]).question}</strong>
          <span>Answer: {(value as LessonArtifactMap["exitTicket"]).answer}</span>
        </div>
      )}
    </section>
  );
}

export function ProgressiveLessonBuilder({
  diagnosis,
  injectVerificationFault = false,
  onBack,
  generateArtifactFn = generateLessonArtifact as GenerateArtifactFn,
  verifyFn = verifyAndRepair,
  singleShotFn = generateLesson,
  progressiveEnabled = process.env.NEXT_PUBLIC_PROGRESSIVE_LESSON_BUILD !== "false",
}: ProgressiveLessonBuilderProps) {
  const [sections, setSections] = useState<Partial<LessonArtifactMap>>({});
  const [errors, setErrors] = useState<Partial<Record<LessonArtifactKey, string>>>({});
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const buildId = useRef(0);

  const loadArtifact = useCallback(async (key: LessonArtifactKey, id = buildId.current) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
    try {
      const value = await generateArtifactFn(diagnosis, key);
      if (buildId.current !== id) return;
      setSections((current) => ({ ...current, [key]: value }));
    } catch (error) {
      if (buildId.current !== id) return;
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : `${LABELS[key]} could not be drafted.`,
      }));
      throw error;
    }
  }, [diagnosis, generateArtifactFn]);

  useEffect(() => {
    const id = ++buildId.current;
    setSections({});
    setErrors({});
    setVerification(null);
    setIsVerifying(false);

    if (progressiveEnabled) {
      void Promise.allSettled(LESSON_ARTIFACT_KEYS.map((key) => loadArtifact(key, id)));
    } else {
      void singleShotFn(diagnosis).then((pack) => {
        if (buildId.current === id) setSections(sectionsFromPack(pack));
      }).catch((error) => {
        if (buildId.current !== id) return;
        const message = error instanceof Error ? error.message : "The lesson pack could not be generated.";
        setErrors(Object.fromEntries(LESSON_ARTIFACT_KEYS.map((key) => [key, message])));
      });
    }
    return () => { buildId.current += 1; };
  }, [diagnosis, loadArtifact, progressiveEnabled, singleShotFn]);

  const assembledPack = useMemo(() => assemblePack(sections, diagnosis), [diagnosis, sections]);

  useEffect(() => {
    if (!assembledPack || isVerifying || verification) return;
    const id = buildId.current;
    setIsVerifying(true);
    void (async () => {
      try {
        let checked: Awaited<ReturnType<VerifyFn>>;
        if (injectVerificationFault) {
          const baseline = await verifyFn(assembledPack, diagnosis);
          checked = baseline.result.passed
            ? await verifyFn(injectBrokenTarget(baseline.pack), diagnosis)
            : baseline;
        } else {
          checked = await verifyFn(assembledPack, diagnosis);
        }
        if (buildId.current !== id) return;
        setSections(sectionsFromPack(checked.pack));
        setVerification(checked.result);
      } catch (error) {
        if (buildId.current !== id) return;
        setVerification({
          passed: false,
          checks: { schema: false, numerical: 0, answerKey: 0, stateTransition: 0, misconceptionAlignment: false },
          repairCycles: 0,
          notes: [error instanceof Error ? error.message : "Verification could not complete."],
        });
      } finally {
        if (buildId.current === id) setIsVerifying(false);
      }
    })();
  }, [assembledPack, diagnosis, injectVerificationFault, isVerifying, verification, verifyFn]);

  const verified = verification?.passed === true;
  const needsReview = verification?.passed === false;

  return (
    <div className="card lesson progressive-lesson">
      {verification && <VerificationReceipt result={verification} />}
      <div className="lesson-head">
        <div>
          <div className="eyebrow">02 / Teacher-confirmed lesson pack</div>
          <h2>Differentiated fraction intervention</h2>
          <p className="muted">Targets: {diagnosis.primary.label}</p>
        </div>
        {verified ? (
          <span className="pill"><Sparkles size={12} /> VERIFIED</span>
        ) : (
          <span className="pill draft-pill"><span className="checking-dot" aria-hidden="true" />{needsReview ? "TEACHER REVIEW" : "DRAFT · CHECKING"}</span>
        )}
      </div>

      {isVerifying && !verification && (
        <div className="assembly-check" role="status" aria-live="polite">
          <span className="section-loader compact" aria-hidden="true"><i /><i /><i /></span>
          All sections arrived. Running deterministic checks…
        </div>
      )}

      <div className="progressive-explanations">
        {(["scaffolded", "core", "extension"] as const).map((key) => (
          <LessonSection key={key} sectionKey={key} value={sections[key]} error={errors[key]} verified={verified} needsReview={needsReview} onRetry={() => void loadArtifact(key).catch(() => undefined)} />
        ))}
      </div>
      <div className="progressive-resources">
        <LessonSection sectionKey="manipulative" value={sections.manipulative} error={errors.manipulative} verified={verified} needsReview={needsReview} onRetry={() => void loadArtifact("manipulative").catch(() => undefined)} />
        <div className="progressive-practice-stack">
          <LessonSection sectionKey="practice" value={sections.practice} error={errors.practice} verified={verified} needsReview={needsReview} onRetry={() => void loadArtifact("practice").catch(() => undefined)} />
          <LessonSection sectionKey="exitTicket" value={sections.exitTicket} error={errors.exitTicket} verified={verified} needsReview={needsReview} onRetry={() => void loadArtifact("exitTicket").catch(() => undefined)} />
        </div>
      </div>
      <div className="lesson-actions">
        <button className="secondary" onClick={onBack}><RotateCcw size={14} /> Edit confirmation</button>
        {verified && <button className="print" onClick={() => window.print()}><Printer size={14} /> Print intervention</button>}
      </div>
      {!verified && !needsReview && <p className="draft-honesty"><Check size={14} /> Draft sections appear as they arrive. The verified receipt waits for deterministic checks.</p>}
    </div>
  );
}
