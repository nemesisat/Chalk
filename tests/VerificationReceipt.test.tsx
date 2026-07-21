// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { VerificationReceipt } from "../components/VerificationReceipt";
import type { VerificationResult } from "../types";

afterEach(cleanup);

const passed: VerificationResult = {
  passed: true,
  checks: {
    schema: true,
    numerical: 4,
    answerKey: 3,
    stateTransition: 2,
    misconceptionAlignment: true,
  },
  repairCycles: 1,
  notes: ["Manipulative target is not the correct reduced sum."],
};

describe("VerificationReceipt", () => {
  it("renders and expands a passed receipt with repair counts", async () => {
    const user = userEvent.setup();
    render(<VerificationReceipt result={passed} />);
    const summary = screen.getByText("Lesson verified");
    expect(screen.getAllByText("Verified after 1 repair cycle")).toHaveLength(2);
    await user.click(summary);
    expect(screen.getByText("4 numerical assertions passed")).toBeTruthy();
    expect(screen.getByText("3 answer-key checks passed")).toBeTruthy();
    expect(screen.getByText("2 state transitions passed")).toBeTruthy();
    expect(screen.getByText("Misconception alignment passed")).toBeTruthy();
  });

  it("renders validator notes without a verified claim on failure", async () => {
    const user = userEvent.setup();
    render(<VerificationReceipt result={{
      ...passed,
      passed: false,
      checks: { schema: false, numerical: 0, answerKey: 0, stateTransition: 0, misconceptionAlignment: false },
      repairCycles: 3,
    }} />);
    const summary = screen.getByText("Needs teacher review");
    await user.click(summary);
    expect(screen.getByText("The pack was not marked as verified")).toBeTruthy();
    expect(screen.getByText("Manipulative target is not the correct reduced sum.")).toBeTruthy();
    expect(screen.queryByText("Lesson verified")).toBeNull();
  });
});
