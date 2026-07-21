import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FractionBar } from "../components/FractionBar";
import { DraftFractionBar } from "../components/ProgressiveLessonBuilder";
import { diagnoseWithClient, type OpenAIClientLike } from "../lib/diagnose-server";
import {
  generateLessonArtifactWithClient,
  type LessonOpenAIClientLike,
} from "../lib/generate-lesson-server";
import {
  isAdditionMisconceptionId,
  isSubtractionMisconceptionId,
} from "../lib/misconceptions";
import { verifyAndRepairWithClient } from "../lib/verify-lesson-server";
import { normalizedPracticeQuestionKey } from "../lib/lesson";
import { injectBrokenTarget } from "../lib/verification-demo";
import type { LessonArtifactMap, LessonPack } from "../types";

const runLive = process.env.RUN_LIVE_CHALK === "1";

describe.skipIf(!runLive)("live Chalk golden path", () => {
  it("verifies 1/9 + 1/4 and renders its compact 36-part visual", async () => {
    const envFile = readFileSync(`${process.cwd()}/.env.local`, "utf8");
    const keyMatch = envFile.match(/^OPENAI_API_KEY=(.*)$/m);
    const apiKey = process.env.OPENAI_API_KEY
      ?? keyMatch?.[1].trim().replace(/^['\"]|['\"]$/g, "");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live golden test.");

    const syntheticWork = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
        <rect width="1000" height="700" fill="#fbf8ed"/>
        <g stroke="#b9c3c0" stroke-width="2" opacity="0.65">
          <path d="M60 150H940M60 250H940M60 350H940M60 450H940M60 550H940"/>
        </g>
        <text x="190" y="390" fill="#bd5f2a" font-family="Comic Sans MS, cursive" font-size="92" transform="rotate(-2 500 350)">1/9 + 1/4 = 2/13</text>
      </svg>
    `);
    const image = await sharp(syntheticWork).png().toBuffer();
    const imageDataUrl = `data:image/png;base64,${image.toString("base64")}`;
    const client = new OpenAI({ apiKey });
    const diagnosis = await diagnoseWithClient(
      imageDataUrl,
      client as unknown as OpenAIClientLike,
    );
    expect(diagnosis.operation).toBe("add");
    expect(diagnosis.transcription).toContain("1/9");
    expect(diagnosis.transcription).toContain("1/4");
    expect(isAdditionMisconceptionId(diagnosis.primary.id)).toBe(true);

    const lessonClient = client as unknown as LessonOpenAIClientLike;
    const keys = [
      "scaffolded",
      "core",
      "extension",
      "manipulative",
      "practice",
      "exitTicket",
    ] as const;
    const generated = await Promise.all(keys.map(async (key) => [
      key,
      await generateLessonArtifactWithClient(diagnosis, key, lessonClient),
    ] as const));
    const sections = Object.fromEntries(generated) as unknown as LessonArtifactMap;
    const generatedPack: LessonPack = {
      operation: diagnosis.operation,
      misconception: diagnosis.primary.id,
      explanations: {
        scaffolded: sections.scaffolded,
        core: sections.core,
        extension: sections.extension,
      },
      manipulative: sections.manipulative,
      practice: sections.practice,
      exitTicket: sections.exitTicket,
    };
    const verified = await verifyAndRepairWithClient(generatedPack, diagnosis, lessonClient);
    if (!verified.result.passed) {
      throw new Error(`Live large-denominator verification failed: ${verified.result.notes.join(" | ")}`);
    }

    expect(verified.pack.manipulative.target).toBe("13/36");
    expect(verified.result.checks.stateTransition).toBe(verified.pack.manipulative.steps.length);
    const markup = renderToStaticMarkup(<DraftFractionBar spec={verified.pack.manipulative} />);
    expect(markup).toContain('data-layout="compact"');
    expect(markup).toContain('data-common-denominator="36"');
    expect(markup).toContain("fraction-bar-svg");
    expect(markup).toContain("36 parts — shown compact");
    expect(markup).not.toContain("Visual model heads-up");
  }, 600_000);

  it("diagnoses, generates, repairs one deliberate failure, and renders only the verified pack", async () => {
    const envFile = readFileSync(`${process.cwd()}/.env.local`, "utf8");
    const keyMatch = envFile.match(/^OPENAI_API_KEY=(.*)$/m);
    const apiKey = process.env.OPENAI_API_KEY
      ?? keyMatch?.[1].trim().replace(/^['"]|['"]$/g, "");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live golden test.");

    const image = readFileSync(`${process.cwd()}/public/sample-1-3-plus-1-4.png`);
    const imageDataUrl = `data:image/png;base64,${image.toString("base64")}`;
    const client = new OpenAI({ apiKey });
    const diagnosis = await diagnoseWithClient(
      imageDataUrl,
      client as unknown as OpenAIClientLike,
    );
    expect(isAdditionMisconceptionId(diagnosis.primary.id)).toBe(true);
    expect(diagnosis.transcription).toContain("1/3");
    expect(diagnosis.transcription).toContain("1/4");
    if (diagnosis.primary.id === "add_across") {
      expect(diagnosis.alternatives.map((item) => item.id)).not.toContain(
        "no_common_denominator",
      );
    }

    const lessonClient = client as unknown as LessonOpenAIClientLike;
    const keys = [
      "scaffolded",
      "core",
      "extension",
      "manipulative",
      "practice",
      "exitTicket",
    ] as const;
    const generated = await Promise.all(
      keys.map(async (key) => [
        key,
        await generateLessonArtifactWithClient(diagnosis, key, lessonClient),
      ] as const),
    );
    const sections = Object.fromEntries(generated) as unknown as LessonArtifactMap;
    const generatedPack: LessonPack = {
      operation: diagnosis.operation,
      misconception: diagnosis.primary.id,
      explanations: {
        scaffolded: sections.scaffolded,
        core: sections.core,
        extension: sections.extension,
      },
      manipulative: sections.manipulative,
      practice: sections.practice,
      exitTicket: sections.exitTicket,
    };
    const baseline = await verifyAndRepairWithClient(
      generatedPack,
      diagnosis,
      lessonClient,
    );
    expect(baseline.result.passed).toBe(true);

    const verified = await verifyAndRepairWithClient(
      injectBrokenTarget(baseline.pack),
      diagnosis,
      lessonClient,
    );
    expect(verified.result.passed).toBe(true);
    expect(verified.result.repairCycles).toBe(1);
    expect(verified.pack.misconception).toBe(diagnosis.primary.id);
    expect(verified.pack.manipulative.misconception).toBe(diagnosis.primary.id);
    const teacherFacingText = [
      ...Object.values(verified.pack.explanations).flatMap((mode) => [mode.summary, ...mode.steps]),
      ...verified.pack.practice.flatMap((item) => [item.question, item.answer]),
      verified.pack.exitTicket.question,
      verified.pack.exitTicket.answer,
    ].join("\n");
    expect(teacherFacingText).not.toMatch(
      /expected_partitions|initial_state|targetsMisconception|manipulative\.|\{/i,
    );

    const markup = renderToStaticMarkup(<DraftFractionBar spec={verified.pack.manipulative} />);
    expect(markup).toContain("fraction-bar-component");
    expect(markup).toContain('data-layout="full"');
    expect(markup).toContain('data-common-denominator="12"');
    expect(markup).toContain("data-shaded=\"true\"");
    expect(markup).toContain("equal parts");
    expect(markup).not.toContain("fraction-bar-heads-up");
  }, 600_000);

  it("diagnoses and verifies a human-readable subtraction lesson with take-away states", async () => {
    const envFile = readFileSync(`${process.cwd()}/.env.local`, "utf8");
    const keyMatch = envFile.match(/^OPENAI_API_KEY=(.*)$/m);
    const apiKey = process.env.OPENAI_API_KEY
      ?? keyMatch?.[1].trim().replace(/^['"]|['"]$/g, "");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live golden test.");

    const image = readFileSync(`${process.cwd()}/public/sample-3-4-minus-1-3.png`);
    const imageDataUrl = `data:image/png;base64,${image.toString("base64")}`;
    const client = new OpenAI({ apiKey });
    const diagnosis = await diagnoseWithClient(
      imageDataUrl,
      client as unknown as OpenAIClientLike,
    );
    expect(diagnosis.operation).toBe("subtract");
    expect(isSubtractionMisconceptionId(diagnosis.primary.id)).toBe(true);
    expect(diagnosis.transcription).toContain("3/4");
    expect(diagnosis.transcription).toContain("1/3");
    if (diagnosis.primary.id === "subtract_across") {
      expect(diagnosis.alternatives.map((item) => item.id)).not.toContain(
        "subtract_no_common_denominator",
      );
    }

    const lessonClient = client as unknown as LessonOpenAIClientLike;
    const keys = [
      "scaffolded",
      "core",
      "extension",
      "manipulative",
      "practice",
      "exitTicket",
    ] as const;
    const generated = await Promise.all(keys.map(async (key) => [
      key,
      await generateLessonArtifactWithClient(diagnosis, key, lessonClient),
    ] as const));
    const sections = Object.fromEntries(generated) as unknown as LessonArtifactMap;
    const generatedPack: LessonPack = {
      operation: diagnosis.operation,
      misconception: diagnosis.primary.id,
      explanations: {
        scaffolded: sections.scaffolded,
        core: sections.core,
        extension: sections.extension,
      },
      manipulative: sections.manipulative,
      practice: sections.practice,
      exitTicket: sections.exitTicket,
    };
    const verified = await verifyAndRepairWithClient(
      generatedPack,
      diagnosis,
      lessonClient,
    );
    if (!verified.result.passed) {
      throw new Error(`Live subtraction verification failed: ${verified.result.notes.join(" | ")}`);
    }
    expect(verified.pack.operation).toBe("subtract");
    expect(verified.pack.practice).toHaveLength(5);
    expect(new Set(verified.pack.practice.map((item) =>
      normalizedPracticeQuestionKey(item.question, verified.pack.operation)
    )).size).toBe(5);
    expect(verified.pack.manipulative.steps.some((step) =>
      (step.expected_removed ?? 0) > 0
    )).toBe(true);
    const teacherFacingText = [
      ...Object.values(verified.pack.explanations).flatMap((mode) => [mode.summary, ...mode.steps]),
      ...verified.pack.practice.flatMap((item) => [item.question, item.answer]),
      verified.pack.exitTicket.question,
      verified.pack.exitTicket.answer,
    ].join("\n");
    expect(teacherFacingText).not.toMatch(
      /expected_partitions|expected_removed|initial_state|targetsMisconception|manipulative\.|\{/i,
    );
    for (const step of Object.values(verified.pack.explanations).flatMap((mode) => mode.steps)) {
      const fractionCount = step.match(/\b\d+\s*\/\s*\d+\b/g)?.length ?? 0;
      const operationCount = step.match(/[+−-]/g)?.length ?? 0;
      const proseWordCount = step
        .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
        .replace(/[+−=\-]/g, " ")
        .match(/[A-Za-z]{3,}/g)?.length ?? 0;
      expect(fractionCount >= 4 && operationCount >= 2 && proseWordCount < 4).toBe(false);
    }

    const markup = renderToStaticMarkup(<FractionBar spec={verified.pack.manipulative} />);
    expect(markup).toContain("3/4 − 1/3");
    expect(markup).toContain("data-removed=\"true\"");
    expect(markup).toContain("remain shaded");
  }, 600_000);
});
