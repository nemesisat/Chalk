"use server";

import OpenAI from "openai";
import {
  validateAndNormalizeDiagnosis,
  type Diagnosis,
} from "../../lib/diagnosis";
import {
  generateLessonWithClient,
  type LessonOpenAIClientLike,
} from "../../lib/generate-lesson-server";
import type { LessonPack } from "../../types";
import { isSupportedLessonMisconception } from "../../lib/misconceptions";

export async function generateLesson(diagnosis: Diagnosis): Promise<LessonPack> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }
  const client = new OpenAI({ apiKey });
  const confirmedDiagnosis = validateAndNormalizeDiagnosis(diagnosis);
  if (!isSupportedLessonMisconception(
    confirmedDiagnosis.primary.id,
    confirmedDiagnosis.operation,
  )) {
    throw new Error("This operation and misconception are not supported yet.");
  }
  return generateLessonWithClient(
    confirmedDiagnosis,
    client as unknown as LessonOpenAIClientLike,
  );
}
