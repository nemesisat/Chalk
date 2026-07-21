// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DiagnosisCard,
  confidenceBand,
} from "../components/DiagnosisCard";
import type { Diagnosis } from "../lib/diagnosis";

afterEach(cleanup);

const diagnosis: Diagnosis = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: {
    id: "add_across",
    label: "Adding numerators and denominators directly",
  },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    {
      id: "careless_slip",
      label: "Careless slip (knows the method)",
      explanation: "The student may know the method.",
    },
    {
      id: "misread_operation",
      label: "Misread the operation",
      explanation: "The student may have misread the sign.",
    },
  ],
  teacherCheckQuestion:
    "What does the denominator tell us about the size of each piece?",
};

const props = {
  diagnosis,
  imageSrc: "data:image/png;base64,AA==",
  onConfirm: () => undefined,
  onReset: () => undefined,
};

describe("confidenceBand", () => {
  it.each([
    [0, "Low"],
    [59, "Low"],
    [60, "Medium"],
    [79, "Medium"],
    [80, "High"],
    [86, "High"],
  ] as const)("maps %i to %s", (value, expected) => {
    expect(confidenceBand(value)).toBe(expected);
  });
});

describe("DiagnosisCard", () => {
  it("shows terse evidence and an accessible confidence band", () => {
    render(createElement(DiagnosisCard, props));
    expect(screen.getByText("1 + 1 = 2 · 3 + 4 = 7")).toBeTruthy();
    expect(screen.getByText("Confidence · High · 86%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("86");
  });

  it("selects the primary by default and updates the heading from a chip", async () => {
    const user = userEvent.setup();
    render(createElement(DiagnosisCard, props));

    const primary = screen.getByRole("button", {
      name: "Adding numerators and denominators directly",
    });
    const carelessSlip = screen.getByRole("button", {
      name: "Careless slip (knows the method)",
    });
    expect(primary.getAttribute("aria-pressed")).toBe("true");
    expect(carelessSlip.getAttribute("aria-pressed")).toBe("false");

    await user.click(carelessSlip);

    expect(primary.getAttribute("aria-pressed")).toBe("false");
    expect(carelessSlip.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Careless slip (knows the method)",
      }),
    ).toBeTruthy();
  });

  it("passes the selected quick-check cause through confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(createElement(DiagnosisCard, { ...props, onConfirm }));
    await user.click(screen.getByRole("button", { name: "Careless slip (knows the method)" }));
    await user.click(screen.getByRole("button", { name: "Confirm & build quick check" }));
    expect(onConfirm).toHaveBeenCalledWith("careless_slip");
  });

  it("marks division coming soon and prevents confirmation", async () => {
    const user = userEvent.setup();
    const divisionDiagnosis: Diagnosis = {
      ...diagnosis,
      alternatives: [
        {
          id: "invert_wrong_operand",
          label: "Inverting the wrong number when dividing",
          explanation: "A division hypothesis.",
        },
        diagnosis.alternatives[0],
      ],
    };
    render(createElement(DiagnosisCard, { ...props, diagnosis: divisionDiagnosis }));
    await user.click(screen.getByRole("button", { name: /Inverting the wrong number/ }));
    expect(screen.getByText("Division · coming soon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm & build lesson" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens the image dialog, traps focus, and closes with Escape", async () => {
    const user = userEvent.setup();
    render(createElement(DiagnosisCard, props));

    const thumbnail = screen.getByRole("button", {
      name: "Open the uploaded work at full size",
    });
    await user.click(thumbnail);
    const dialog = screen.getByRole("dialog", { name: "Uploaded student work" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);

    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.keyboard("{Escape}");
    expect(dialog.isConnected).toBe(false);
  });
});
