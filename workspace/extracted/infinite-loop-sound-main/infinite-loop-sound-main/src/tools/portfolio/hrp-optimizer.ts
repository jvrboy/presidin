/**
 * Hierarchical Risk Parity (HRP) — López de Prado's allocation method.
 *
 * 1. Tree clustering on the correlation-distance matrix
 * 2. Quasi-diagonalization of the covariance matrix via cluster linkage order
 * 3. Recursive bisection splitting capital by inverse-variance at each split
 *
 * Unlike Markowitz, HRP needs no matrix inversion and is stable when
 * correlations are ill-conditioned or assets outnumber observations.
 */

export interface HrpAsset {
  symbol: string;
  returns: number[]; // aligned return series
}

export interface HrpResult {
  weights: Record<string, number>; // sum to 1
  order: string[]; // quasi-diagonal leaf order
  portfolioVol: number; // annualized vol of the resulting allocation
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sxy += da * db;
    sxx += da * da;
    syy += db * db;
  }
  if (sxx === 0 || syy === 0) return 0;
  const r = sxy / Math.sqrt(sxx * syy);
  return Math.max(-1, Math.min(1, r));
}

/** Distance d[i,j] = sqrt(0.5·(1 − ρ)) ∈ [0, 1] */
export function correlationDistanceMatrix(seriesList: number[][]): number[][] {
  const n = seriesList.length;
  const d: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rho = pearson(seriesList[i], seriesList[j]);
      const dist = Math.sqrt(Math.max(0, 0.5 * (1 - rho)));
      d[i][j] = dist;
      d[j][i] = dist;
    }
  }
  return d;
}

/** Average-linkage distance between two clusters */
function clusterDistance(dist: number[][], a: number[], b: number[]): number {
  let sum = 0;
  for (const i of a) for (const j of b) sum += dist[i][j];
  return sum / (a.length * b.length);
}

interface LinkageStep {
  left: number[];
  right: number[];
  distance: number;
}

/**
 * Agglomerative average-linkage clustering. Returns merge steps plus the
 * quasi-diagonal leaf order obtained by expanding the final merge recursively.
 */
export function hierarchicalClusters(dist: number[][]): {
  merges: LinkageStep[];
  leafOrder: number[];
} {
  const n = dist.length;
  if (n === 0) return { merges: [], leafOrder: [] };

  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const merges: LinkageStep[] = [];

  while (clusters.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = clusterDistance(dist, clusters[i], clusters[j]);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const left = clusters[bestI];
    const right = clusters[bestJ];
    merges.push({ left, right, distance: bestD });
    const merged = [...left, ...right].sort((a, b) => a - b);
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  // Expand the final merge into a leaf ordering (quasi-diagonalization)
  const leafOrder: number[] = [];
  const expand = (items: number[]): void => {
    if (items.length <= 1) {
      if (items.length === 1) leafOrder.push(items[0]);
      return;
    }
    const sortedKey = [...items].sort((a, b) => a - b);
    const step = merges.find((m) => {
      const combined = [...m.left, ...m.right].sort((a, b) => a - b);
      return combined.length === sortedKey.length && combined.every((v, k) => v === sortedKey[k]);
    });
    if (!step) {
      leafOrder.push(...items);
      return;
    }
    expand(step.left);
    expand(step.right);
  };
  if (merges.length > 0) {
    expand(
      [...merges[merges.length - 1].left, ...merges[merges.length - 1].right].sort((a, b) => a - b),
    );
  } else {
    leafOrder.push(0);
  }

  return { merges, leafOrder };
}

/** Inverse-variance allocation over a set of asset indices */
function inverseVarianceWeights(cov: number[][], items: number[]): Map<number, number> {
  const variances = items.map((i) => Math.max(cov[i][i], 1e-12));
  const invSum = variances.reduce((a, v) => a + 1 / v, 0);
  const w = new Map<number, number>();
  items.forEach((item, k) => w.set(item, 1 / variances[k] / invSum));
  return w;
}

/** Cluster variance under IVP weights */
function clusterVariance(cov: number[][], items: number[]): number {
  const w = inverseVarianceWeights(cov, items);
  let v = 0;
  for (const i of items) {
    for (const j of items) {
      v += (w.get(i) ?? 0) * (w.get(j) ?? 0) * cov[i][j];
    }
  }
  return Math.max(v, 1e-12);
}

export function hierarchicalRiskParity(assets: HrpAsset[], periodsPerYear = 252): HrpResult | null {
  const n = assets.length;
  if (n === 0) return null;

  // Align lengths
  const minLen = Math.min(...assets.map((a) => a.returns.length));
  if (minLen < 5) return null;
  const series = assets.map((a) => a.returns.slice(-minLen));

  // Covariance matrix (sample)
  const means = series.map((s) => s.reduce((x, y) => x + y, 0) / minLen);
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < minLen; t++) {
        s += (series[i][t] - means[i]) * (series[j][t] - means[j]);
      }
      cov[i][j] = s / (minLen - 1);
      cov[j][i] = cov[i][j];
    }
  }

  const dist = correlationDistanceMatrix(series);
  const { leafOrder } = hierarchicalClusters(dist);

  const validOrder = leafOrder.filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  const isPermutation = validOrder.length === n && validOrder.every((v, k) => v === k);

  // Recursive bisection along the quasi-diagonal order
  const weights = new Map<number, number>();
  const distribute = (group: number[], share: number): void => {
    if (group.length === 1) {
      weights.set(group[0], (weights.get(group[0]) ?? 0) + share);
      return;
    }
    const half = Math.floor(group.length / 2);
    const left = group.slice(0, half);
    const right = group.slice(half);
    const leftVar = clusterVariance(cov, left);
    const rightVar = clusterVariance(cov, right);
    const alpha = 1 - leftVar / (leftVar + rightVar);
    distribute(left, share * alpha);
    distribute(right, share * (1 - alpha));
  };

  const startOrder = isPermutation ? leafOrder : Array.from({ length: n }, (_, i) => i);
  distribute(startOrder, 1);

  // Portfolio volatility
  let pv = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      pv += (weights.get(i) ?? 0) * (weights.get(j) ?? 0) * cov[i][j];
    }
  }

  const weightMap: Record<string, number> = {};
  assets.forEach((a, i) => {
    weightMap[a.symbol] = weights.get(i) ?? 0;
  });

  return {
    weights: weightMap,
    order: (isPermutation ? leafOrder : Array.from({ length: n }, (_, i) => i)).map(
      (i) => assets[i]?.symbol ?? `#${i}`,
    ),
    portfolioVol: Math.sqrt(pv * periodsPerYear),
  };
}
