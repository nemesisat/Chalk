// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FractionBar, validateFractionBarSpec } from "../components/FractionBar";
import type { FractionBarSpec } from "../types";

afterEach(cleanup);

function renderBar(spec: FractionBarSpec) {
  return render(createElement(FractionBar, { spec }));
}

describe("FractionBar", () => {
  it("renders 1/3 + 1/4 with 12 partitions and 7 shaded in the final step", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/3", right: "1/4" },
      target: "7/12",
      steps: [
        { prompt: "Make 12 equal parts", expected_partitions: 12, expected_shaded: 0 },
        { prompt: "Shade the combined amount", expected_partitions: 12, expected_shaded: 7 },
      ],
    };

    const { container } = renderBar(spec);
    expect(container.querySelector(".fraction-bar-component")?.getAttribute("data-layout")).toBe("full");
    const finalStep = container.querySelector('[data-step-index="1"]')!;
    expect(finalStep.querySelectorAll("[data-segment]")).toHaveLength(12);
    expect(finalStep.querySelectorAll('[data-shaded="true"]')).toHaveLength(7);
    expect(screen.getByRole("img", { name: "12 equal parts, 7 shaded" })).toBeTruthy();
  });

  it("renders 1/2 + 1/4 with 4 partitions and 3 shaded", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/2", right: "1/4" },
      target: "3/4",
      steps: [
        { prompt: "Shade the combined amount", expected_partitions: 4, expected_shaded: 3 },
      ],
    };

    const { container } = renderBar(spec);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(4);
    expect(container.querySelectorAll('[data-shaded="true"]')).toHaveLength(3);
    expect(screen.getByText("4 equal parts, 3 shaded")).toBeTruthy();
  });

  it("distinguishes shaded segments structurally with a hatch pattern", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/2", right: "1/4" },
      target: "3/4",
      steps: [
        { prompt: "Shade the combined amount", expected_partitions: 4, expected_shaded: 3 },
      ],
    };

    const { container } = renderBar(spec);
    const shaded = container.querySelector('[data-shaded="true"]')!;
    const unshaded = container.querySelector('[data-shaded="false"]')!;
    expect(shaded.getAttribute("fill")).toMatch(/^url\(#.+\)$/);
    expect(unshaded.getAttribute("fill")).toBe("#ffffff");
    expect(container.querySelector("pattern line")).toBeTruthy();
  });

  it("rejects a multiple of the LCD instead of drifting from the server contract", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/2", right: "1/4" },
      target: "3/4",
      steps: [{ prompt: "Too many parts", expected_partitions: 8, expected_shaded: 6 }],
    };
    expect(() => validateFractionBarSpec(spec)).toThrow("common denominator");
  });

  it("renders a fraction bar with exactly 16 equal parts", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/8", right: "1/16" },
      target: "3/16",
      steps: [{ prompt: "Shade the sum", expected_partitions: 16, expected_shaded: 3 }],
    };
    const { container } = renderBar(spec);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(16);
    expect(container.querySelector(".fraction-bar-component")?.getAttribute("data-layout")).toBe("reduced");
  });

  it("renders a compact fraction bar with exactly 24 equal parts", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/8", right: "1/3" },
      target: "11/24",
      steps: [{ prompt: "Shade the sum", expected_partitions: 24, expected_shaded: 11 }],
    };
    const { container } = renderBar(spec);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(24);
    expect(container.querySelector(".fraction-bar-component")?.getAttribute("data-layout")).toBe("reduced");
  });

  it("renders a compact 36-part bar with 13 shaded", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "add",
      misconception: "add_across",
      initial_state: { left: "1/9", right: "1/4" },
      target: "13/36",
      steps: [{ prompt: "Shade the sum", expected_partitions: 36, expected_shaded: 13 }],
    };
    const { container } = renderBar(spec);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(36);
    expect(container.querySelectorAll('[data-shaded="true"]')).toHaveLength(13);
    expect(container.querySelector('[data-layout="compact"]')).toBeTruthy();
    expect(screen.getByRole("img", { name: "36 equal parts, 13 shaded" })).toBeTruthy();
    expect(screen.getByText("36 parts — shown compact")).toBeTruthy();
  });

  it("renders subtraction as shade, remove, then remainder", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "subtract",
      misconception: "subtract_across",
      initial_state: { left: "3/4", right: "1/3" },
      target: "5/12",
      steps: [
        { prompt: "Shade nine twelfths", expected_partitions: 12, expected_shaded: 9, expected_removed: 0 },
        { prompt: "Remove four twelfths", expected_partitions: 12, expected_shaded: 5, expected_removed: 4 },
        { prompt: "Read the remainder", expected_partitions: 12, expected_shaded: 5, expected_removed: 0 },
      ],
    };

    const { container } = renderBar(spec);
    const removalStep = container.querySelector('[data-step-index="1"]')!;
    const finalStep = container.querySelector('[data-step-index="2"]')!;
    expect(removalStep.querySelectorAll('[data-shaded="true"]')).toHaveLength(5);
    expect(removalStep.querySelectorAll('[data-removed="true"]')).toHaveLength(4);
    expect(finalStep.querySelectorAll('[data-shaded="true"]')).toHaveLength(5);
    expect(finalStep.querySelectorAll('[data-removed="true"]')).toHaveLength(0);
    expect(screen.getByText("3/4 − 1/3 → 5/12")).toBeTruthy();
    expect(screen.getByRole("img", {
      name: "12 equal parts, 5 remain shaded, 4 removed",
    })).toBeTruthy();
  });

  it("marks removed pieces structurally with a distinct crosshatch pattern", () => {
    const spec: FractionBarSpec = {
      type: "fraction_bar",
      operation: "subtract",
      misconception: "subtract_across",
      initial_state: { left: "3/4", right: "1/3" },
      target: "5/12",
      steps: [
        { prompt: "Shade", expected_partitions: 12, expected_shaded: 9, expected_removed: 0 },
        { prompt: "Remove", expected_partitions: 12, expected_shaded: 5, expected_removed: 4 },
        { prompt: "Remain", expected_partitions: 12, expected_shaded: 5, expected_removed: 0 },
      ],
    };
    const { container } = renderBar(spec);
    const removed = container.querySelector('[data-removed="true"]')!;
    expect(removed.getAttribute("fill")).toMatch(/^url\(#.+removed.+\)$/);
    expect(container.querySelector('pattern[id*="removed"] path')).toBeTruthy();
  });
});
