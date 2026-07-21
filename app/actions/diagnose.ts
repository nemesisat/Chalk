"use server";

import OpenAI from "openai";
import type { Diagnosis } from "../../lib/diagnosis";
import {
  diagnoseWithClient,
  type OpenAIClientLike,
} from "../../lib/diagnose-server";

export async function diagnose(imageDataUrl: string): Promise<Diagnosis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const client = new OpenAI({ apiKey });
  return diagnoseWithClient(imageDataUrl, client as unknown as OpenAIClientLike);
}
