import { useId } from "react";
import type { FractionBarSpec } from "../types";
import {
  calculateFractions,
  compareFractions,
  equivalent,
  gcd,
  lcm,
  operationSymbol,
  parseFraction,
} from "../lib/fraction-math";
import {
  fractionBarPartCount,
  FULL_SIZE_FRACTION_BAR_PARTITIONS,
  REDUCED_SIZE_FRACTION_BAR_PARTITIONS,
} from "../lib/lesson";

export type FractionBarProps = {
  spec: FractionBarSpec;
};

export function validateFractionBarSpec(spec: FractionBarSpec): void {
  if (spec.type !== "fraction_bar"
    || (spec.operation !== "add" && spec.operation !== "subtract")
    || spec.steps.length === 0) {
    throw new Error("FractionBar requires a fraction_bar spec with at least one step.");
  }

  const left = parseFraction(spec.initial_state.left);
  const right = parseFraction(spec.initial_state.right);
  const target = parseFraction(spec.target);
  const commonDenominator = lcm(left.denominator, right.denominator);
  if (spec.operation === "subtract" && compareFractions(left, right) < 0) {
    throw new Error("FractionBar subtraction requires the larger fraction first.");
  }

  const leftAtLcd = left.numerator * (commonDenominator / left.denominator);
  const rightAtLcd = right.numerator * (commonDenominator / right.denominator);
  const finalShaded = spec.operation === "add"
    ? leftAtLcd + rightAtLcd
    : leftAtLcd - rightAtLcd;

  spec.steps.forEach((step) => {
    if (
      !Number.isInteger(step.expected_partitions) ||
      step.expected_partitions <= 0 ||
      step.expected_partitions !== commonDenominator ||
      !Number.isInteger(step.expected_shaded) ||
      step.expected_shaded < 0 ||
      step.expected_shaded > step.expected_partitions ||
      (spec.operation === "subtract" && (
        !Number.isInteger(step.expected_removed)
        || step.expected_removed! < 0
        || step.expected_removed! > step.expected_partitions
      )) ||
      (spec.operation === "add" && step.expected_removed !== undefined)
    ) {
      throw new Error("FractionBar step values must be valid and use a common denominator.");
    }
  });

  if (spec.operation === "subtract") {
    const firstStep = spec.steps[0];
    const hasRemovalStep = spec.steps.some((step) =>
      step.expected_shaded === finalShaded
      && step.expected_removed === rightAtLcd
      && step.expected_shaded + step.expected_removed === leftAtLcd
    );
    if (spec.steps.length < 3
      || firstStep.expected_shaded !== leftAtLcd
      || firstStep.expected_removed !== 0
      || !hasRemovalStep) {
      throw new Error("FractionBar subtraction must show the starting amount, removal, and remainder.");
    }
  }

  const finalStep = spec.steps[spec.steps.length - 1];
  const correct = calculateFractions(left, right, spec.operation);
  if (finalStep.expected_shaded !== finalShaded
    || (spec.operation === "subtract" && finalStep.expected_removed !== 0)
    || !equivalent(target, correct)
    || gcd(target.numerator, target.denominator) !== 1) {
    throw new Error("FractionBar final step does not match the target fraction.");
  }
}

export function FractionBar({ spec }: FractionBarProps) {
  validateFractionBarSpec(spec);
  const idPrefix = useId().replace(/:/g, "");
  const partitionCount = fractionBarPartCount(
    spec.initial_state.left,
    spec.initial_state.right,
  );
  const layout = partitionCount <= FULL_SIZE_FRACTION_BAR_PARTITIONS
    ? "full"
    : partitionCount <= REDUCED_SIZE_FRACTION_BAR_PARTITIONS
      ? "reduced"
      : "compact";
  const segmentWidth = layout === "full" ? 40 : layout === "reduced" ? 24 : 12;

  return (
    <section
      className={`fraction-bar-component fraction-bar-${layout}`}
      data-layout={layout}
      data-common-denominator={partitionCount}
      aria-labelledby={`${idPrefix}-title`}
    >
      <div className="fraction-bar-heading">
        <h3 id={`${idPrefix}-title`}>Fraction bar</h3>
        <span>{spec.initial_state.left} {operationSymbol(spec.operation)} {spec.initial_state.right} → {spec.target}</span>
      </div>
      <ol className="fraction-bar-steps">
        {spec.steps.map((step, stepIndex) => {
          const removedCount = step.expected_removed ?? 0;
          const summary = spec.operation === "subtract"
            ? `${step.expected_partitions} equal parts, ${step.expected_shaded} remain shaded, ${removedCount} removed`
            : `${step.expected_partitions} equal parts, ${step.expected_shaded} shaded`;
          const patternId = `${idPrefix}-hatch-${stepIndex}`;
          const removedPatternId = `${idPrefix}-removed-${stepIndex}`;
          return (
            <li className="fraction-bar-step" key={`${step.prompt}-${stepIndex}`} data-step-index={stepIndex}>
              <div className="fraction-bar-step-copy"><strong>{step.prompt}</strong><span>{summary}</span></div>
              <div
                className="fraction-bar-viewport"
                tabIndex={layout === "full" ? undefined : 0}
                aria-label={layout === "full" ? undefined : `${summary}. Scroll horizontally to inspect every part.`}
              >
                <svg
                  className="fraction-bar-svg"
                  viewBox={`0 0 ${step.expected_partitions * segmentWidth} 48`}
                  role="img"
                  aria-label={summary}
                  preserveAspectRatio="none"
                  style={{ minWidth: layout === "full" ? undefined : `${step.expected_partitions * segmentWidth}px` }}
                >
                <defs>
                  <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#d8eadf" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#18312d" strokeWidth="3" />
                  </pattern>
                  <pattern id={removedPatternId} width="8" height="8" patternUnits="userSpaceOnUse">
                    <rect width="8" height="8" fill="#f2e4dd" />
                    <path d="M0 0L8 8M8 0L0 8" stroke="#6f2f23" strokeWidth="2" />
                  </pattern>
                </defs>
                {Array.from({ length: step.expected_partitions }, (_, segmentIndex) => {
                  const shaded = segmentIndex < step.expected_shaded;
                  const removed = spec.operation === "subtract"
                    && removedCount > 0
                    && segmentIndex >= step.expected_shaded
                    && segmentIndex < step.expected_shaded + removedCount;
                  return (
                    <rect
                      key={segmentIndex}
                      data-segment={segmentIndex}
                      data-shaded={shaded ? "true" : "false"}
                      data-removed={removed ? "true" : "false"}
                      x={segmentIndex * segmentWidth}
                      y="1"
                      width={segmentWidth}
                      height="46"
                      fill={removed
                        ? `url(#${removedPatternId})`
                        : shaded
                          ? `url(#${patternId})`
                          : "#ffffff"}
                      stroke="#18312d"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                </svg>
              </div>
            </li>
          );
        })}
      </ol>
      {layout === "compact" && (
        <p className="fraction-bar-compact-caption">{partitionCount} parts — shown compact</p>
      )}
    </section>
  );
}
