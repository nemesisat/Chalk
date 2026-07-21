"use server";

import OpenAI from "openai";
import {
  validateAndNormalizeDiagnosis,
  type Diagnosis,
} from "../../lib/diagnosis";
import {
  generateLessonArtifactWithClient,
  type LessonOpenAIClientLike,
} from "../../lib/generate-lesson-server";
import { isSupportedLessonMisconception } from "../../lib/misconceptions";
import type { LessonArtifactKey, LessonArtifactMap } from "../../types";

export async function generateLessonArtifact<K extends LessonArtifactKey>(
  diagnosis: Diagnosis,
  key: K,
): Promise<LessonArtifactMap[K]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const confirmedDiagnosis = validateAndNormalizeDiagnosis(diagnosis);
  if (!isSupportedLessonMisconception(
    confirmedDiagnosis.primary.id,
    confirmedDiagnosis.operation,
  )) {
    throw new Error("This operation and misconception are not supported yet.");
  }
  const client = new OpenAI({ apiKey });
  return generateLessonArtifactWithClient(
    confirmedDiagnosis,
    key,
    client as unknown as LessonOpenAIClientLike,
  );
}
