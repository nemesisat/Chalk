"use server";

import OpenAI from "openai";
import { validateAndNormalizeDiagnosis, type Diagnosis } from "../../lib/diagnosis";
import { isSupportedLessonMisconception } from "../../lib/misconceptions";
import {
  verifyAndRepairWithClient,
} from "../../lib/verify-lesson-server";
import type { LessonOpenAIClientLike } from "../../lib/generate-lesson-server";
import type { LessonPack, VerificationResult } from "../../types";

export async function verifyAndRepair(
  pack: LessonPack,
  diagnosis: Diagnosis,
): Promise<{ pack: LessonPack; result: VerificationResult }> {
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
  return verifyAndRepairWithClient(
    pack,
    confirmedDiagnosis,
    client as unknown as LessonOpenAIClientLike,
  );
}
