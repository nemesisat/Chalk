import type { Diagnosis } from "./diagnosis";
import {
  calculateFractions,
  formatFraction,
  lcm,
  parseFractionExpression,
} from "./fraction-math";
import {
  exitTicketJsonSchemaFor,
  explanationJsonSchema,
  fractionBarSpecJsonSchemaFor,
  fractionsFromTranscription,
  lessonPackJsonSchemaFor,
  practiceItemJsonSchemaFor,
} from "./lesson";
import type {
  LessonArtifactKey,
  LessonArtifactMap,
  LessonPack,
} from "../types";

type ResponseLike = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    phase?: string;
    agent?: { agent_name?: string } | null;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};
type CreateResponse = (request: Record<string, unknown>) => Promise<ResponseLike>;

export type LessonOpenAIClientLike = {
  responses: { create: CreateResponse };
  beta?: { responses: { create: CreateResponse } };
};

function practiceSchema(operation: Diagnosis["operation"]) {
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    practice: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: practiceItemJsonSchemaFor(operation),
    },
  },
  required: ["practice"],
  } as const;
}

function hardConstraints(operation: Diagnosis["operation"]): string {
  const symbol = operation === "add" ? "+" : "−";
  const resultWord = operation === "add" ? "sum" : "difference";
  const operationRules = operation === "add"
    ? `- The final shaded count is the correct sum numerator when expressed in LCD parts.\n- Combine the two renamed fractions; do not use removal steps.`
    : `- The left fraction must be greater than or equal to the right fraction, and the result must be between 0 and 1.\n- Use take-away states: first shade the left fraction in LCD parts; next mark exactly the right fraction's parts as removed; finally show only the remainder.\n- Every subtraction step includes the numeric removed-part count. The final step has zero removed parts and shades exactly the remainder.`;
  return `
Hard constraints:
- Set operation to "${operation}" throughout the lesson pack and fraction-bar spec.
- Use the two diagnosed fractions exactly as the fraction bar's starting fractions and keep their order.
- Every manipulative step uses exactly the least common denominator as expected_partitions.
- Always return the mathematically anchored fraction-bar spec. The interface renders it full size through 12 parts, with reduced cells from 13 through 24 parts, and as a thin-cell compact bar above 24 parts. It always renders a visual.
- The target is the correct reduced ${resultWord}.
${operationRules}
- Use only bare fraction-${operation === "add" ? "addition" : "subtraction"} practice questions in the form "a/b ${symbol} c/d" and reduced fraction answers in the form "a/b".
- The exit-ticket question must also be exactly a bare "a/b ${symbol} c/d" expression, with no prose before or after it.
- Every practice item targets the confirmed misconception and sets targetsMisconception to true.
- Return exactly five genuinely distinct practice questions. Never repeat the diagnosed problem or another practice item; for addition, reversed addends still count as the same problem.
- Every problem uses unlike denominators, puts the larger fraction first for subtraction, and has an LCD of 12 or less.
- Scaffolded is simple and one step at a time; Core is grade-level direct instruction; Extension deepens reasoning and transfer.
- All summaries, teaching steps, bar prompts, practice questions, and exit-ticket text must use plain teacher language that could be said aloud.
- Explanation summaries and steps contain teaching prose only. Never embed a sequence of practice problems, answer keys, or bare fraction expressions inside an explanation; those belong only in the practice array.
- Never put JSON, schema/property names, code, or internal flags in human-facing text. Forbidden examples include manipulative.initial_state, expected_partitions, expected_shaded, expected_removed, initial_state, targetsMisconception, manipulative., and raw JSON.
`;
}

export function lessonArithmeticFacts(diagnosis: Diagnosis) {
  const expression = parseFractionExpression(diagnosis.transcription);
  const lcd = lcm(expression.left.denominator, expression.right.denominator);
  const leftParts = expression.left.numerator * (lcd / expression.left.denominator);
  const rightParts = expression.right.numerator * (lcd / expression.right.denominator);
  const result = calculateFractions(expression.left, expression.right, expression.operation);
  return {
    operation: expression.operation,
    left: formatFraction(expression.left),
    right: formatFraction(expression.right),
    lcd,
    leftParts,
    rightParts,
    resultParts: expression.operation === "add"
      ? leftParts + rightParts
      : leftParts - rightParts,
    target: formatFraction(result),
  };
}

function diagnosisContext(diagnosis: Diagnosis): string {
  const [left, right] = fractionsFromTranscription(diagnosis.transcription);
  const facts = lessonArithmeticFacts(diagnosis);
  const barFacts = diagnosis.operation === "add"
    ? `Required bar arithmetic: ${facts.lcd} equal parts; ${facts.leftParts} plus ${facts.rightParts} gives ${facts.resultParts}; target ${facts.target}.`
    : `Required bar arithmetic: ${facts.lcd} equal parts; first shade ${facts.leftParts}; then show ${facts.resultParts} still shaded and ${facts.rightParts} removed; finally show ${facts.resultParts} shaded and 0 removed; target ${facts.target}.`;
  return [
    `Confirmed misconception: ${diagnosis.primary.label} (${diagnosis.primary.id}).`,
    `Confirmed operation: ${diagnosis.operation}.`,
    `Transcribed work: ${diagnosis.transcription}`,
    `Diagnosed fractions in order: ${left} and ${right}.`,
    `Evidence from the work: ${diagnosis.evidence.join(" · ")}`,
    `Teacher check: ${diagnosis.teacherCheckQuestion}`,
    barFacts,
    hardConstraints(diagnosis.operation),
  ].join("\n");
}

function strictFormat(name: string, schema: unknown) {
  return { type: "json_schema", name, strict: true, schema };
}

export function extractResponseText(response: ResponseLike): string {
  if (response.output_text?.trim()) return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => (
      item.type === "message"
      && item.agent?.agent_name === "/root"
      && item.phase === "final_answer"
        ? item.content ?? []
        : []
    ))
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

function parsePack(response: ResponseLike, diagnosis: Diagnosis): LessonPack {
  const responseText = extractResponseText(response);
  if (!responseText) throw new Error("The model did not return a lesson pack.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("The model returned invalid lesson pack JSON.");
  }
  // Stage 4 owns deterministic validation and repair. Generation only parses
  // the strict structured response so a flawed artifact can reach that gate.
  return parsed as LessonPack;
}

async function tryHostedMultiAgent(
  diagnosis: Diagnosis,
  client: LessonOpenAIClientLike,
): Promise<LessonPack> {
  if (!client.beta?.responses) throw new Error("Multi-agent beta is unavailable.");
  const response = await client.beta.responses.create({
    model: "gpt-5.6-sol",
    store: false,
    betas: ["responses_multi_agent=v1"],
    multi_agent: { enabled: true, max_concurrent_subagents: 5 },
    reasoning: { effort: "high", context: "all_turns" },
    instructions: `You coordinate a differentiated fractions lesson for the confirmed operation. In parallel, delegate exactly five focused tasks: scaffolded explanation, core explanation, extension explanation, FractionBarSpec, and targeted practice plus exit ticket. Critically synthesize their work into one internally consistent LessonPack. Human-facing text must be plain teacher language with no JSON, field names, or internal flags. Explanations contain prose only, never practice or answer lists. Return five distinct practice questions, and keep practice and exit-ticket questions as bare fraction expressions using the confirmed operation. Return only the structured object.`,
    input: diagnosisContext(diagnosis),
    text: {
      format: strictFormat(
        "chalk_lesson_pack",
        lessonPackJsonSchemaFor(diagnosis.primary.id, diagnosis.operation),
      ),
    },
  });
  return parsePack(response, diagnosis);
}

type DraftRole = {
  name: LessonArtifactKey;
  model: "gpt-5.6-terra" | "gpt-5.6-luna";
  instruction: string;
  schema: unknown;
};

const DRAFT_ROLES: DraftRole[] = [
  {
    name: "scaffolded",
    model: "gpt-5.6-terra",
    instruction: "Draft only the scaffolded explanation: simple language and one small step at a time, using words a teacher could say aloud. Each step must be a clean prose teaching sentence. Never include a list of practice problems, answers, bare expressions, JSON, field names, or internal flags.",
    schema: explanationJsonSchema,
  },
  {
    name: "core",
    model: "gpt-5.6-terra",
    instruction: "Draft only the concise, grade-level core explanation in words a teacher could say aloud. Each step must be a clean prose teaching sentence. Never include a list of practice problems, answers, bare expressions, JSON, field names, or internal flags.",
    schema: explanationJsonSchema,
  },
  {
    name: "extension",
    model: "gpt-5.6-terra",
    instruction: "Draft only the extension explanation with deeper reasoning and transfer, in words a teacher could say aloud. Each step must be a clean prose teaching sentence. Never include a list of practice problems, answers, bare expressions, JSON, field names, or internal flags.",
    schema: explanationJsonSchema,
  },
  {
    name: "manipulative",
    model: "gpt-5.6-luna",
    instruction: "Draft only the deterministic FractionBarSpec. Copy the exact required bar arithmetic from the context. For subtraction, return at least three ordered states: starting shade, take-away, and remainder.",
    schema: null,
  },
  {
    name: "practice",
    model: "gpt-5.6-luna",
    instruction: "Draft exactly five distinct targeted fraction problems for the confirmed operation. Every question must be a bare fraction expression with no prose prefix. Do not repeat the diagnosed problem or another item; reversed addends count as duplicates. Compute every reduced answer exactly and never expose internal flags in question text.",
    schema: null,
  },
  {
    name: "exitTicket",
    model: "gpt-5.6-luna",
    instruction: "Draft only one concise exit ticket for the confirmed operation. Its question must be exactly a bare fraction expression with no prose prefix, and its answer must be correctly reduced.",
    schema: null,
  },
];

function roleFor(key: LessonArtifactKey): DraftRole {
  const role = DRAFT_ROLES.find((candidate) => candidate.name === key);
  if (!role) throw new Error(`Unknown lesson artifact: ${key}`);
  return role;
}

function schemaForRole(role: DraftRole, diagnosis: Diagnosis): unknown {
  if (role.name === "manipulative") {
    return fractionBarSpecJsonSchemaFor(diagnosis.primary.id, diagnosis.operation);
  }
  if (role.name === "practice") {
    return practiceSchema(diagnosis.operation);
  }
  if (role.name === "exitTicket") {
    return exitTicketJsonSchemaFor(diagnosis.operation);
  }
  return role.schema;
}

export async function generateLessonArtifactWithClient<K extends LessonArtifactKey>(
  diagnosis: Diagnosis,
  key: K,
  client: LessonOpenAIClientLike,
): Promise<LessonArtifactMap[K]> {
  const role = roleFor(key);
  const response = await client.responses.create({
    model: role.model,
    store: false,
    reasoning: { effort: "medium", context: "all_turns" },
    instructions: `${role.instruction}\nReturn only the structured object.`,
    input: diagnosisContext(diagnosis),
    text: { format: strictFormat(`chalk_${role.name}`, schemaForRole(role, diagnosis)) },
  });
  const output = extractResponseText(response);
  if (!output) throw new Error(`${role.name} did not return a draft.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`${role.name} returned invalid JSON.`);
  }
  if (key === "practice") {
    return (parsed as { practice: LessonArtifactMap["practice"] }).practice as LessonArtifactMap[K];
  }
  return parsed as LessonArtifactMap[K];
}

async function fallbackParallelGeneration(
  diagnosis: Diagnosis,
  client: LessonOpenAIClientLike,
): Promise<LessonPack> {
  const context = diagnosisContext(diagnosis);
  const drafts = await Promise.all(DRAFT_ROLES.map(async (role) => {
    const response = await client.responses.create({
      model: role.model,
      store: false,
      reasoning: { effort: "medium", context: "all_turns" },
      instructions: `${role.instruction}\nReturn only the structured object.`,
      input: context,
      text: { format: strictFormat(role.name, schemaForRole(role, diagnosis)) },
    });
    if (!response.output_text) throw new Error(`${role.name} did not return a draft.`);
    return { role: role.name, output: response.output_text };
  }));

  const synthesis = await client.responses.create({
    model: "gpt-5.6-sol",
    store: false,
    reasoning: { effort: "high", context: "all_turns" },
    instructions: `Synthesize the specialist drafts into one mathematically correct LessonPack for the confirmed operation. Resolve conflicts using the confirmed diagnosis and hard constraints. Keep every human-facing string in plain teacher language, never JSON, field names, or internal flags. Explanations contain prose only and never practice or answer lists. Return five distinct practice questions and keep practice and exit-ticket questions as bare fraction expressions using the confirmed operation. Return only the structured object.`,
    input: `${context}\nSpecialist drafts:\n${JSON.stringify(drafts)}`,
    text: {
      format: strictFormat(
        "chalk_lesson_pack",
        lessonPackJsonSchemaFor(diagnosis.primary.id, diagnosis.operation),
      ),
    },
  });
  return parsePack(synthesis, diagnosis);
}

export async function generateLessonWithClient(
  diagnosis: Diagnosis,
  client: LessonOpenAIClientLike,
): Promise<LessonPack> {
  if (hostedMultiAgentSupport !== "unsupported") {
    try {
      const pack = await tryHostedMultiAgent(diagnosis, client);
      hostedMultiAgentSupport = "supported";
      console.info("[chalk] lesson generation path: hosted multi-agent beta");
      return pack;
    } catch (error) {
      if (isBetaUnsupported(error)) {
        hostedMultiAgentSupport = "unsupported";
        console.info("[chalk] hosted multi-agent beta unsupported; caching parallel fallback");
      } else {
        console.warn("[chalk] hosted multi-agent beta failed; using parallel fallback", error);
      }
    }
  }
  console.info("[chalk] lesson generation path: parallel Terra/Luna drafts + Sol synthesis");
  return fallbackParallelGeneration(diagnosis, client);
}

let hostedMultiAgentSupport: "unknown" | "supported" | "unsupported" = "unknown";

function isBetaUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { status?: number; code?: string };
  return candidate.message === "Multi-agent beta is unavailable."
    || candidate.message === "The model did not return a lesson pack."
    || candidate.status === 404
    || candidate.code === "unsupported_beta";
}

export function resetHostedMultiAgentCapabilityForTests(): void {
  hostedMultiAgentSupport = "unknown";
}
