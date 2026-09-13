/**
 * Multi-Criteria Decision Analyzer - MCDA with AHP, TOPSIS, and ELECTRE methods
 * Extends the decision engine with multi-criteria optimization for trade selection
 */

export interface Criterion {
  name: string;
  weight: number;
  type: "benefit" | "cost";
}

export interface Alternative {
  name: string;
  values: Record<string, number>;
}

export interface MCDAAResult {
  rankings: { alternative: string; score: number; rank: number }[];
  method: string;
  consistencyRatio: number;
}

export class MultiCriteriaDecisionAnalyzer {
  ahp(alternatives: Alternative[], criteria: Criterion[]): MCDAAResult {
    const n = criteria.length;
    const pairwiseMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ratio = criteria[i].weight / criteria[j].weight;
        pairwiseMatrix[i][j] = ratio;
        pairwiseMatrix[j][i] = 1 / ratio;
      }
    }

    const weights = this.ahpWeights(pairwiseMatrix);
    const consistencyRatio = this.consistencyRatio(pairwiseMatrix, weights);

    const scores = alternatives.map((alt) => {
      let score = 0;
      for (const criterion of criteria) {
        const value = alt.values[criterion.name] ?? 0;
        const normalized = criterion.type === "benefit" ? value : 1 / (value || 0.001);
        score += normalized * weights[criteria.indexOf(criterion)];
      }
      return { alternative: alt.name, score, rank: 0 };
    });

    scores.sort((a, b) => b.score - a.score);
    scores.forEach((s, i) => (s.rank = i + 1));

    return { rankings: scores, method: "AHP", consistencyRatio };
  }

  topsis(alternatives: Alternative[], criteria: Criterion[]): MCDAAResult {
    const normalizedMatrix = this.normalizeMatrix(alternatives, criteria);
    const weights = criteria.map((c) => c.weight);
    const weightedMatrix = normalizedMatrix.map((row) => row.map((v, i) => v * weights[i]));

    const idealBest: number[] = [];
    const idealWorst: number[] = [];
    for (let j = 0; j < criteria.length; j++) {
      const col = weightedMatrix.map((row) => row[j]);
      if (criteria[j].type === "benefit") {
        idealBest.push(Math.max(...col));
        idealWorst.push(Math.min(...col));
      } else {
        idealBest.push(Math.min(...col));
        idealWorst.push(Math.max(...col));
      }
    }

    const scores = alternatives.map((alt, i) => {
      const distBest = Math.sqrt(
        weightedMatrix[i].reduce((sum, v, j) => sum + Math.pow(v - idealBest[j], 2), 0),
      );
      const distWorst = Math.sqrt(
        weightedMatrix[i].reduce((sum, v, j) => sum + Math.pow(v - idealWorst[j], 2), 0),
      );
      const score = distWorst / (distBest + distWorst || 1);
      return { alternative: alt.name, score, rank: 0 };
    });

    scores.sort((a, b) => b.score - a.score);
    scores.forEach((s, i) => (s.rank = i + 1));

    return { rankings: scores, method: "TOPSIS", consistencyRatio: 0 };
  }

  electre(alternatives: Alternative[], criteria: Criterion[]): MCDAAResult {
    const normalized = this.normalizeMatrix(alternatives, criteria);
    const weights = criteria.map((c) => c.weight);
    const weighted = normalized.map((row) => row.map((v, i) => v * weights[i]));

    const concordanceMatrix: number[][] = Array.from({ length: alternatives.length }, () =>
      new Array(alternatives.length).fill(0),
    );
    const discordanceMatrix: number[][] = Array.from({ length: alternatives.length }, () =>
      new Array(alternatives.length).fill(0),
    );

    for (let i = 0; i < alternatives.length; i++) {
      for (let j = 0; j < alternatives.length; j++) {
        if (i === j) continue;
        let concordance = 0;
        let maxDiscordance = 0;
        for (let k = 0; k < criteria.length; k++) {
          if (criteria[k].type === "benefit") {
            if (weighted[i][k] >= weighted[j][k]) concordance += weights[k];
            maxDiscordance = Math.max(maxDiscordance, Math.abs(weighted[j][k] - weighted[i][k]));
          } else {
            if (weighted[i][k] <= weighted[j][k]) concordance += weights[k];
            maxDiscordance = Math.max(maxDiscordance, Math.abs(weighted[i][k] - weighted[j][k]));
          }
        }
        concordanceMatrix[i][j] = concordance;
        discordanceMatrix[i][j] = maxDiscordance;
      }
    }

    const scores = alternatives.map((alt, i) => {
      const outranking = concordanceMatrix[i].reduce(
        (sum, c, j) => sum + (c > 0.5 && discordanceMatrix[i][j] < 0.3 ? 1 : 0),
        0,
      );
      return { alternative: alt.name, score: outranking, rank: 0 };
    });

    scores.sort((a, b) => b.score - a.score);
    scores.forEach((s, i) => (s.rank = i + 1));

    return { rankings: scores, method: "ELECTRE", consistencyRatio: 0 };
  }

  private normalizeMatrix(alternatives: Alternative[], criteria: Criterion[]): number[][] {
    return alternatives.map((alt) =>
      criteria.map((c) => {
        const allValues = alternatives.map((a) => a.values[c.name] ?? 0);
        const max = Math.max(...allValues);
        const min = Math.min(...allValues);
        const value = alt.values[c.name] ?? 0;
        return max === min ? 1 : (value - min) / (max - min);
      }),
    );
  }

  private ahpWeights(matrix: number[][]): number[] {
    const n = matrix.length;
    const rowSums = matrix.map((row) => row.reduce((a, b) => a + b, 0));
    const totalSum = rowSums.reduce((a, b) => a + b, 0);
    return rowSums.map((s) => s / totalSum);
  }

  private consistencyRatio(matrix: number[][], weights: number[]): number {
    const n = matrix.length;
    // lambdaMax = mean of (Aw)_i / w_i (standard AHP approximation)
    const lambdaMax =
      weights.reduce((sum, w, i) => {
        if (w === 0) return sum;
        const awi = matrix[i].reduce((s, v, j) => s + v * weights[j], 0);
        return sum + awi / w;
      }, 0) / n;
    const ci = (lambdaMax - n) / (n - 1);
    const ri = [0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49][n] || 1.49;
    return ri > 0 ? ci / ri : 0;
  }
}

export default MultiCriteriaDecisionAnalyzer;
