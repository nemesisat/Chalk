export type FractionOperation = "add" | "subtract";

export interface FractionBarSpec {
  type: "fraction_bar";
  operation: FractionOperation;
  misconception: string;
  initial_state: { left: string; right: string };
  target: string;
  steps: {
    prompt: string;
    expected_partitions: number;
    expected_shaded: number;
    expected_removed?: number;
  }[];
}

export interface LessonPack {
  operation: FractionOperation;
  misconception: string;
  explanations: {
    scaffolded: { summary: string; steps: string[] };
    core: { summary: string; steps: string[] };
    extension: { summary: string; steps: string[] };
  };
  manipulative: FractionBarSpec;
  practice: {
    question: string;
    answer: string;
    targetsMisconception: boolean;
  }[];
  exitTicket: { question: string; answer: string };
}

export interface VerificationResult {
  passed: boolean;
  checks: {
    schema: boolean;
    numerical: number;
    answerKey: number;
    stateTransition: number;
    misconceptionAlignment: boolean;
  };
  repairCycles: number;
  notes: string[];
}

export interface LessonArtifactMap {
  scaffolded: LessonPack["explanations"]["scaffolded"];
  core: LessonPack["explanations"]["core"];
  extension: LessonPack["explanations"]["extension"];
  manipulative: FractionBarSpec;
  practice: LessonPack["practice"];
  exitTicket: LessonPack["exitTicket"];
}

export type LessonArtifactKey = keyof LessonArtifactMap;
