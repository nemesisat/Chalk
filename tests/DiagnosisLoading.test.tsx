// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnosis } from "../lib/diagnosis";

const diagnoseMock = vi.hoisted(() => vi.fn());
vi.mock("../app/actions/diagnose", () => ({ diagnose: diagnoseMock }));

import Home from "../app/page";

afterEach(() => {
  cleanup();
  diagnoseMock.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const diagnosis: Diagnosis = {
  operation: "add",
  transcription: "1/3 + 1/4 = 2/7",
  primary: { id: "add_across", label: "Adding numerators and denominators directly" },
  confidence: 86,
  evidence: ["1 + 1 = 2", "3 + 4 = 7"],
  alternatives: [
    { id: "careless_slip", label: "Careless slip (knows the method)", explanation: "Possible slip." },
    { id: "misread_operation", label: "Misread the operation", explanation: "Possible misread." },
  ],
  teacherCheckQuestion: "What does the denominator tell us about the size of each piece?",
};

describe("diagnosis loading state", () => {
  it("replaces the right intro with loading messages and result-shaped skeletons while diagnosis is pending", async () => {
    const pending = deferred<Diagnosis>();
    diagnoseMock.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<Home />);

    const upload = document.querySelector("#upload-photo") as HTMLInputElement;
    await user.upload(upload, new File([new Uint8Array([1, 2, 3])], "work.png", { type: "image/png" }));
    await user.click(await screen.findByRole("button", { name: "Diagnose this work" }));

    const panel = await screen.findByRole("region", { name: "Diagnosis in progress" });
    expect(within(panel).getByRole("status").textContent).toContain("Reading the handwriting…");
    expect(within(panel).getByText("Transcription")).toBeTruthy();
    expect(within(panel).getByText("Evidence")).toBeTruthy();
    expect(within(panel).getByText("Confidence")).toBeTruthy();
    expect(screen.queryByText("A careful read, not a label.")).toBeNull();
    expect(panel.getAttribute("aria-busy")).toBe("true");

    await act(async () => pending.resolve(diagnosis));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Diagnosis in progress" })).toBeNull());
    expect(screen.getByText("1/3 + 1/4 = 2/7")).toBeTruthy();
  });
});
