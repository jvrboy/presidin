/**
 * Fuzzy Decision Engine - Fuzzy logic-based trading decisions with linguistic variables
 * Extends the decision engine with fuzzy rule inference and defuzzification
 */

export interface FuzzySet {
  name: string;
  membership: (x: number) => number;
}

export interface FuzzyRule {
  antecedents: { variable: string; set: string }[];
  operator: "AND" | "OR";
  consequent: { variable: string; set: string };
  weight: number;
}

export interface FuzzyVariable {
  name: string;
  range: [number, number];
  sets: FuzzySet[];
}

export interface FuzzyDecision {
  output: number;
  confidence: number;
  firedRules: { rule: FuzzyRule; strength: number }[];
  linguisticOutput: string;
}

export class FuzzyDecisionEngine {
  private variables: Map<string, FuzzyVariable> = new Map();
  private rules: FuzzyRule[] = [];

  addVariable(variable: FuzzyVariable): void {
    this.variables.set(variable.name, variable);
  }

  addRule(rule: FuzzyRule): void {
    this.rules.push(rule);
  }

  triangular(a: number, b: number, c: number): (x: number) => number {
    return (x: number) => {
      if (x < a || x > c) return 0;
      if (x === b) return 1;
      // Guard degenerate (zero-width) segments to avoid division by zero
      if (x < b) return b - a <= 0 ? 1 : (x - a) / (b - a);
      return c - b <= 0 ? 1 : (c - x) / (c - b);
    };
  }

  trapezoidal(a: number, b: number, c: number, d: number): (x: number) => number {
    return (x: number) => {
      if (x < a || x > d) return 0;
      if (x >= b && x <= c) return 1;
      if (x < b) return b - a <= 0 ? 1 : (x - a) / (b - a);
      return d - c <= 0 ? 1 : (d - x) / (d - c);
    };
  }

  evaluate(inputs: Record<string, number>, outputVariable: string): FuzzyDecision {
    const firedRules: { rule: FuzzyRule; strength: number }[] = [];
    const outputVar = this.variables.get(outputVariable);
    if (!outputVar)
      return { output: 0, confidence: 0, firedRules: [], linguisticOutput: "unknown" };

    for (const rule of this.rules) {
      if (rule.consequent.variable !== outputVariable) continue;

      let strength: number;
      const antecedentStrengths = rule.antecedents.map((ant) => {
        const variable = this.variables.get(ant.variable);
        if (!variable) return 0;
        const setInput = inputs[ant.variable];
        if (setInput === undefined) return 0;
        const set = variable.sets.find((s) => s.name === ant.set);
        return set ? set.membership(setInput) : 0;
      });

      if (rule.operator === "AND") {
        strength = Math.min(...antecedentStrengths) * rule.weight;
      } else {
        strength = Math.max(...antecedentStrengths) * rule.weight;
      }

      if (strength > 0) {
        firedRules.push({ rule, strength });
      }
    }

    const output = this.defuzzify(firedRules, outputVar);
    const confidence =
      firedRules.length > 0
        ? firedRules.reduce((s, r) => s + r.strength, 0) / firedRules.length
        : 0;
    const linguisticOutput = this.getLinguisticOutput(output, outputVar);

    return { output, confidence, firedRules, linguisticOutput };
  }

  private defuzzify(
    firedRules: { rule: FuzzyRule; strength: number }[],
    outputVar: FuzzyVariable,
  ): number {
    if (firedRules.length === 0) return (outputVar.range[0] + outputVar.range[1]) / 2;

    let numerator = 0;
    let denominator = 0;

    for (const { rule, strength } of firedRules) {
      const set = outputVar.sets.find((s) => s.name === rule.consequent.set);
      if (!set) continue;

      const [min, max] = outputVar.range;
      const step = (max - min) / 100;
      for (let x = min; x <= max; x += step) {
        const membership = Math.min(strength, set.membership(x));
        numerator += x * membership * step;
        denominator += membership * step;
      }
    }

    return denominator > 0
      ? numerator / denominator
      : (outputVar.range[0] + outputVar.range[1]) / 2;
  }

  private getLinguisticOutput(value: number, variable: FuzzyVariable): string {
    let maxMembership = 0;
    let result = "unknown";
    for (const set of variable.sets) {
      const membership = set.membership(value);
      if (membership > maxMembership) {
        maxMembership = membership;
        result = set.name;
      }
    }
    return result;
  }

  getRules(): FuzzyRule[] {
    return [...this.rules];
  }

  getVariables(): FuzzyVariable[] {
    return Array.from(this.variables.values());
  }
}

export default FuzzyDecisionEngine;
