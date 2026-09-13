/**
 * Combinatorial Purged Cross-Validation (CPCV) — López de Prado.
 *
 * Unlike walk-forward (which tests a single path), CPCV backtests every
 * combinatorial IS/OOS split of N blocks taken P at a time, producing many
 * OOS paths. Embargo purges observations adjacent to the test boundary to
 * prevent leakage from serially-correlated labels.
 */

export interface CpcvConfig {
  nBlocks: number; // number of contiguous data blocks
  pTestBlocks: number; // blocks held out per combination
  embargoBlocks?: number; // blocks dropped around each test block boundary
}

export interface CpcvSplit {
  trainIndices: number[];
  testIndices: number[]; // already embargo-purged
}

export interface CpcvEvaluation {
  combinations: number;
  oosScoresByCombination: number[][]; // per-combination list of OOS performance
  meanOosScore: number;
  stdOosScore: number;
  // distribution of OOS performance across all paths — the basis for
  // probabilistic decision-making instead of a single backtest number
  scoreDistribution: number[];
  worstPathScore: number;
  bestPathScore: number;
}

/** Generate all C(n, p) train/test splits with embargo purging applied. */
export function generateCpcvSplits(totalObservations: number, config: CpcvConfig): CpcvSplit[] {
  const { nBlocks, pTestBlocks, embargoBlocks = 0 } = config;
  if (nBlocks < 4 || pTestBlocks < 1 || pTestBlocks > nBlocks / 2 || totalObservations <= 0) {
    return [];
  }

  const blockSize = Math.floor(totalObservations / nBlocks);
  // Each block needs at least 2 observations to carry signal
  if (blockSize < 2) return [];

  const blockRange = (b: number): [number, number] => [
    b * blockSize,
    b === nBlocks - 1 ? totalObservations : (b + 1) * blockSize,
  ];

  const splits: CpcvSplit[] = [];
  const indices = Array.from({ length: nBlocks }, (_, i) => i);

  // Enumerate combinations of p test blocks
  const combos: number[][] = [];
  const combine = (start: number, current: number[]): void => {
    if (current.length === pTestBlocks) {
      combos.push([...current]);
      return;
    }
    for (let i = start; i < nBlocks; i++) combine(i + 1, [...current, i]);
  };
  combine(0, []);

  for (const test of combos) {
    const testSet = new Set(test);

    // Embargo: purge observations within `embargoBlocks` of any test block edge
    // on both sides (labels may look ahead across boundaries)
    const embargoed = new Set<number>();
    if (embargoBlocks > 0) {
      for (const tb of test) {
        for (let e = 1; e <= embargoBlocks; e++) {
          if (tb - e >= 0 && !testSet.has(tb - e)) embargoed.add(tb - e);
          if (tb + e < nBlocks && !testSet.has(tb + e)) embargoed.add(tb + e);
        }
      }
    }

    const train: number[] = [];
    const purgedTest: number[] = [];
    for (const b of indices) {
      const [s, e] = blockRange(b);
      if (testSet.has(b)) {
        for (let i = s; i < e; i++) purgedTest.push(i);
      } else if (!embargoed.has(b)) {
        for (let i = s; i < e; i++) train.push(i);
      }
      // embargoed blocks are excluded from both sides
    }

    if (train.length > 0 && purgedTest.length > 0) {
      splits.push({ trainIndices: train, testIndices: purgedTest });
    }
  }

  return splits;
}

/**
 * Run an evaluation function across all CPCV splits and aggregate the OOS
 * score distribution. `evaluate` receives the train and test index arrays and
 * returns the OOS performance metric for that path.
 */
export function runCpcv(
  totalObservations: number,
  config: CpcvConfig,
  evaluate: (trainIdx: number[], testIdx: number[]) => number,
): CpcvEvaluation | null {
  const splits = generateCpcvSplits(totalObservations, config);
  if (splits.length === 0) return null;

  const oosScoresByCombination: number[][] = [];
  const flat: number[] = [];

  for (const split of splits) {
    let score: number;
    try {
      score = evaluate(split.trainIndices, split.testIndices);
    } catch {
      continue;
    }
    if (!Number.isFinite(score)) continue;
    oosScoresByCombination.push([score]);
    flat.push(score);
  }

  if (flat.length === 0) return null;

  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  const variance = flat.reduce((s, x) => s + (x - mean) ** 2, 0) / flat.length;

  return {
    combinations: flat.length,
    oosScoresByCombination,
    meanOosScore: mean,
    stdOosScore: Math.sqrt(variance),
    scoreDistribution: flat.sort((a, b) => a - b),
    worstPathScore: flat[0],
    bestPathScore: flat[flat.length - 1],
  };
}
