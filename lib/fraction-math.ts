import type { FractionOperation } from "../types";

export type Fraction = { numerator: number; denominator: number };
export type FractionExpression = {
  left: Fraction;
  right: Fraction;
  operation: FractionOperation;
};

export function parseFraction(value: string): Fraction {
  const match = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) throw new Error(`Invalid fraction: ${value}`);
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`Invalid fraction: ${value}`);
  }
  return { numerator, denominator };
}

export function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

export function reduce(fraction: Fraction): Fraction {
  const divisor = gcd(fraction.numerator, fraction.denominator);
  return {
    numerator: fraction.numerator / divisor,
    denominator: fraction.denominator / divisor,
  };
}

export function addFractions(left: Fraction, right: Fraction): Fraction {
  const denominator = lcm(left.denominator, right.denominator);
  return reduce({
    numerator: left.numerator * (denominator / left.denominator)
      + right.numerator * (denominator / right.denominator),
    denominator,
  });
}

export function compareFractions(left: Fraction, right: Fraction): number {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

export function subtractFractions(left: Fraction, right: Fraction): Fraction {
  if (compareFractions(left, right) < 0) {
    throw new Error("Fraction subtraction requires the larger fraction first.");
  }
  const denominator = lcm(left.denominator, right.denominator);
  return reduce({
    numerator: left.numerator * (denominator / left.denominator)
      - right.numerator * (denominator / right.denominator),
    denominator,
  });
}

export function calculateFractions(
  left: Fraction,
  right: Fraction,
  operation: FractionOperation,
): Fraction {
  return operation === "add" ? addFractions(left, right) : subtractFractions(left, right);
}

export function equivalent(left: Fraction, right: Fraction): boolean {
  return left.numerator * right.denominator === right.numerator * left.denominator;
}

export function formatFraction(fraction: Fraction): string {
  return `${fraction.numerator}/${fraction.denominator}`;
}

export function parseAdditionOperands(value: string): [Fraction, Fraction] {
  const expression = parseFractionExpression(value);
  if (expression.operation !== "add") {
    throw new Error("The confirmed diagnosis does not contain a readable fraction addition.");
  }
  return [expression.left, expression.right];
}

export function parseFractionExpression(value: string): FractionExpression {
  const match = value.match(/(\d+\s*\/\s*\d+)\s*(\+|[-−])\s*(\d+\s*\/\s*\d+)/);
  if (!match) {
    throw new Error("The confirmed diagnosis does not contain a readable fraction addition or subtraction.");
  }
  return {
    left: parseFraction(match[1]),
    operation: match[2] === "+" ? "add" : "subtract",
    right: parseFraction(match[3]),
  };
}

export function operationSymbol(operation: FractionOperation): "+" | "−" {
  return operation === "add" ? "+" : "−";
}
