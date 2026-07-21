import { describe, expect, it } from "vitest";
import type { Diagnosis } from "../lib/diagnosis";
import { buildQuickCheck } from "../lib/quick-check";

const diagnosis = {
  operation: "add",
  transcription: "2/7 from 1/3 + 1/4",
  primary: { id: "add_across", label: "Adding numerators and denominators directly" },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    { id: "careless_slip", label: "Careless slip", explanation: "One-off error" },
    { id: "misread_operation", label: "Misread", explanation: "Read the sign incorrectly" },
  ],
  teacherCheckQuestion: "What does the denominator mean?",
} satisfies Diagnosis;

describe("buildQuickCheck", () => {
  it("uses a Core-only quick check with the anchored original addition", () => {
    const result = buildQuickCheck(diagnosis, "careless_slip");
    expect(result.label).toContain("quick check");
    expect(result.practice[0]).toEqual({ question: "1/3 + 1/4", answer: "7/12" });
    expect(result).not.toHaveProperty("explanations");
    expect(result).not.toHaveProperty("manipulative");
  });

  it("frames a misread as re-reading the operation, not a re-teach", () => {
    const result = buildQuickCheck(diagnosis, "misread_operation");
    expect(result.cause).toBe("misread_operation");
    expect(result.label).toContain("misread");
    expect(result.summary).toMatch(/name and circle the operation/i);
    expect(result.practice[0]).toEqual({ question: "1/3 + 1/4", answer: "7/12" });
  });

  it("keeps subtraction in a subtraction quick check", () => {
    const result = buildQuickCheck({
      ...diagnosis,
      operation: "subtract",
      transcription: "3/4 − 1/3 = 2/1",
      primary: {
        id: "subtract_across",
        label: "Subtracting numerators and denominators directly",
      },
    }, "careless_slip");
    expect(result.practice[0]).toEqual({ question: "3/4 − 1/3", answer: "5/12" });
    expect(result.practice[1]).toEqual({ question: "3/4 − 1/2", answer: "1/4" });
  });
});
