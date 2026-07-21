import sharp from "sharp";
import {
  diagnosisJsonSchema,
  type Diagnosis,
  validateAndNormalizeDiagnosis,
} from "./diagnosis";
import { misconceptionPromptLibrary } from "./misconceptions";

const MODEL_INSTRUCTION =
  "You are a math-education diagnostician. Given an image of a student's handwritten fraction work, transcribe it, detect whether the operation is addition or subtraction, then identify the SINGLE most likely operation-appropriate misconception from the provided library. Quote evidence verbatim. A wrong answer may be a careless slip or misread, not a misconception — reflect that in confidence and alternatives. Return only the structured object.";

export type OpenAIClientLike = {
  responses: {
    create: (request: Record<string, unknown>) => Promise<{ output_text: string }>;
  };
};

function decodeDataUrl(imageDataUrl: string): Buffer {
  const match = imageDataUrl.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/,
  );
  if (!match) throw new Error("Choose a JPEG, PNG, or WEBP image.");

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
    throw new Error("The image must be between 1 byte and 10 MB.");
  }
  return buffer;
}

export async function stripImageMetadata(imageDataUrl: string): Promise<string> {
  const sanitized = await sharp(decodeDataUrl(imageDataUrl), { failOn: "error" })
    .rotate()
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return `data:image/jpeg;base64,${sanitized.toString("base64")}`;
}

export async function diagnoseWithClient(
  imageDataUrl: string,
  client: OpenAIClientLike,
): Promise<Diagnosis> {
  const sanitizedImage = await stripImageMetadata(imageDataUrl);
  const response = await client.responses.create({
    model: "gpt-5.6-sol",
    reasoning: { effort: "high", mode: "pro" },
    store: false,
    instructions: MODEL_INSTRUCTION,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Misconception library (primary.id must be one of these ids):\n${misconceptionPromptLibrary()}\n\nSet operation from the visible + or − sign. For subtraction, use subtraction-specific misconception ids; for addition, use addition-specific ids. Return evidence as short verbatim arithmetic tokens, one step per item. Return exactly two genuinely different alternatives. Prefer careless_slip and misread_operation when the evidence supports them. If primary.id is add_across, do not use no_common_denominator as an alternative; if primary.id is subtract_across, do not use subtract_no_common_denominator as an alternative. Those pairs restate the same visible error. If the work is unreadable or looks like a slip, use low confidence and say so honestly.`,
        },
        { type: "input_image", image_url: sanitizedImage, detail: "original" },
      ],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "fraction_work_diagnosis",
        strict: true,
        schema: diagnosisJsonSchema,
      },
    },
  });

  if (!response.output_text) throw new Error("The model did not return a diagnosis.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new Error("The model returned invalid diagnosis JSON.");
  }
  return validateAndNormalizeDiagnosis(parsed);
}
