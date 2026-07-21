// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DraftFractionBar,
  LESSON_ARTIFACT_KEYS,
  ProgressiveLessonBuilder,
} from "../components/ProgressiveLessonBuilder";
import type { Diagnosis } from "../lib/diagnosis";
import type {
  FractionBarSpec,
  LessonArtifactKey,
  LessonArtifactMap,
  LessonPack,
  VerificationResult,
} from "../types";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const diagnosis: Diagnosis = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: { id: "add_across", label: "Adding numerators and denominators directly" },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    { id: "careless_slip", label: "Careless slip (knows the method)", explanation: "Possible slip." },
    { id: "misread_operation", label: "Misread the operation", explanation: "Possible misread." },
  ],
  teacherCheckQuestion: "What does the denominator tell us about the size of each piece?",
};

const artifacts: LessonArtifactMap = {
  scaffolded: { summary: "Small steps landed", steps: ["Rename each fraction."] },
  core: { summary: "Core explanation landed", steps: ["Use twelfths."] },
  extension: { summary: "Challenge landed", steps: ["Generalize the rule."] },
  manipulative: {
    type: "fraction_bar",
    operation: "add",
    misconception: "add_across",
    initial_state: { left: "1/3", right: "1/4" },
    target: "7/12",
    steps: [
      { prompt: "Make 12 equal parts", expected_partitions: 12, expected_shaded: 0 },
      { prompt: "Shade the sum", expected_partitions: 12, expected_shaded: 7 },
    ],
  },
  practice: [
    { question: "1/2 + 1/3", answer: "5/6", targetsMisconception: true },
    { question: "1/4 + 1/6", answer: "5/12", targetsMisconception: true },
    { question: "1/2 + 1/4", answer: "3/4", targetsMisconception: true },
    { question: "1/6 + 1/3", answer: "1/2", targetsMisconception: true },
  ],
  exitTicket: { question: "1/3 + 1/6", answer: "1/2" },
};

const pack: LessonPack = {
  operation: "add",
  misconception: "add_across",
  explanations: {
    scaffolded: artifacts.scaffolded,
    core: artifacts.core,
    extension: artifacts.extension,
  },
  manipulative: artifacts.manipulative,
  practice: artifacts.practice,
  exitTicket: artifacts.exitTicket,
};

const passed: VerificationResult = {
  passed: true,
  checks: { schema: true, numerical: 4, answerKey: 5, stateTransition: 2, misconceptionAlignment: true },
  repairCycles: 0,
  notes: [],
};

describe("ProgressiveLessonBuilder", () => {
  it.each([
    ["1/3 + 1/4", {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/3", right: "1/4" },
      target: "7/12",
      steps: [{ prompt: "Shade the sum", expected_partitions: 12, expected_shaded: 7 }],
    }],
    ["3/4 − 1/3", {
      type: "fraction_bar",
      operation: "subtract",
      misconception: "subtract_across",
      initial_state: { left: "3/4", right: "1/3" },
      target: "5/12",
      steps: [
        { prompt: "Shade the start", expected_partitions: 12, expected_shaded: 9, expected_removed: 0 },
        { prompt: "Remove four parts", expected_partitions: 12, expected_shaded: 5, expected_removed: 4 },
        { prompt: "Show the remainder", expected_partitions: 12, expected_shaded: 5, expected_removed: 0 },
      ],
    }],
    ["1/6 + 1/4", {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/6", right: "1/4" },
      target: "5/12",
      steps: [{ prompt: "Shade the sum", expected_partitions: 12, expected_shaded: 5 }],
    }],
  ] as const)("renders the normal 12-part bar for %s", (_label, spec) => {
    render(<DraftFractionBar spec={spec as unknown as FractionBarSpec} />);
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.querySelector('[data-layout="full"]')).toBeTruthy();
  });

  it("renders a reduced-cell bar for an LCD of 24", () => {
    render(
      <DraftFractionBar
        spec={{
          type: "fraction_bar",
          operation: "add",
          misconception: "add_across",
          initial_state: { left: "1/8", right: "1/3" },
          target: "11/24",
          steps: [{ prompt: "Shade the sum", expected_partitions: 24, expected_shaded: 11 }],
        }}
      />,
    );
    expect(screen.getByRole("img")).toBeTruthy();
    expect(document.querySelector('[data-layout="reduced"]')).toBeTruthy();
    expect(document.querySelectorAll("[data-segment]")).toHaveLength(24);
  });

  it("renders a compact 36-part bar instead of a text fallback", () => {
    const { container } = render(
      <DraftFractionBar
        spec={{
          type: "fraction_bar",
          operation: "add",
          misconception: "add_across",
          initial_state: { left: "1/9", right: "1/4" },
          target: "13/36",
          steps: [
            { prompt: "Make 36 equal parts", expected_partitions: 36, expected_shaded: 0 },
            { prompt: "Shade the sum", expected_partitions: 36, expected_shaded: 13 },
          ],
        }}
      />,
    );

    const finalStep = container.querySelector('[data-step-index="1"]')!;
    expect(finalStep.querySelectorAll("[data-segment]")).toHaveLength(36);
    expect(finalStep.querySelectorAll('[data-shaded="true"]')).toHaveLength(13);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(container.querySelector('[data-layout="compact"]')).toBeTruthy();
    expect(screen.getByText("36 parts — shown compact")).toBeTruthy();
    expect(screen.queryByText("Visual model heads-up")).toBeNull();
  });

  it("reveals sections independently and withholds the receipt until verification resolves", async () => {
    const artifactDeferred = Object.fromEntries(
      LESSON_ARTIFACT_KEYS.map((key) => [key, deferred<LessonArtifactMap[LessonArtifactKey]>()]),
    ) as Record<LessonArtifactKey, ReturnType<typeof deferred<LessonArtifactMap[LessonArtifactKey]>>>;
    const verificationDeferred = deferred<{ pack: LessonPack; result: VerificationResult }>();
    const generateArtifactFn = vi.fn((_: Diagnosis, key: LessonArtifactKey) => artifactDeferred[key].promise);
    const verifyFn = vi.fn(() => verificationDeferred.promise);

    render(
      <ProgressiveLessonBuilder
        diagnosis={diagnosis}
        onBack={() => undefined}
        generateArtifactFn={generateArtifactFn}
        verifyFn={verifyFn}
        progressiveEnabled
      />,
    );

    expect(screen.getByRole("status", { name: "Scaffolded section is loading" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Core section is loading" })).toBeTruthy();
    expect(screen.queryByText("Lesson verified")).toBeNull();

    await act(async () => artifactDeferred.scaffolded.resolve(artifacts.scaffolded));
    expect(await screen.findByText("Small steps landed")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Core section is loading" })).toBeTruthy();
    expect(screen.queryByText("Core explanation landed")).toBeNull();
    expect(verifyFn).not.toHaveBeenCalled();

    await act(async () => {
      artifactDeferred.core.resolve(artifacts.core);
      artifactDeferred.extension.resolve(artifacts.extension);
      artifactDeferred.manipulative.resolve(artifacts.manipulative);
      artifactDeferred.practice.resolve(artifacts.practice);
      artifactDeferred.exitTicket.resolve(artifacts.exitTicket);
    });

    await waitFor(() => expect(verifyFn).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Core explanation landed")).toBeTruthy();
    expect(screen.getByText("All sections arrived. Running deterministic checks…")).toBeTruthy();
    expect(screen.queryByText("Lesson verified")).toBeNull();

    const repairedPack = structuredClone(pack);
    repairedPack.explanations.core.summary = "Core explanation repaired";
    await act(async () => verificationDeferred.resolve({ pack: repairedPack, result: passed }));
    expect(await screen.findByText("Lesson verified")).toBeTruthy();
    expect(screen.getByText("Core explanation repaired")).toBeTruthy();
    expect(screen.queryByText("Core explanation landed")).toBeNull();
    expect(screen.queryByText("DRAFT · checking…")).toBeNull();
  });

  it("keeps a failed section local and retries only that card", async () => {
    const user = userEvent.setup();
    let coreAttempts = 0;
    const generateArtifactFn = vi.fn(async (_: Diagnosis, key: LessonArtifactKey) => {
      if (key === "core" && coreAttempts++ === 0) throw new Error("Core draft timed out.");
      return artifacts[key];
    });
    const verifyFn = vi.fn().mockResolvedValue({ pack, result: passed });

    render(
      <ProgressiveLessonBuilder
        diagnosis={diagnosis}
        onBack={() => undefined}
        generateArtifactFn={generateArtifactFn}
        verifyFn={verifyFn}
        progressiveEnabled
      />,
    );

    const retry = await screen.findByRole("button", { name: "Retry Core" });
    expect(screen.getByText("Core draft timed out.")).toBeTruthy();
    expect(screen.getByText("Small steps landed")).toBeTruthy();
    expect(verifyFn).not.toHaveBeenCalled();

    await user.click(retry);
    expect(await screen.findByText("Core explanation landed")).toBeTruthy();
    await waitFor(() => expect(verifyFn).toHaveBeenCalledTimes(1));
  });
});
