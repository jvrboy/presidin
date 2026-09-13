/** Model registry with promotion / rollback state machine.
 *  Modes: research → backtest → paper → shadow → demo → restricted-live → live → emergency-stop
 *  Every promotion must clear the statistical gate defined in `promotionGate`.
 */
export type Mode = 'research' | 'backtest' | 'paper' | 'shadow' | 'demo' | 'restricted-live' | 'live' | 'emergency-stop';

export interface ModelVersion {
  id: string;
  version: string;
  createdAt: string;
  metrics: { winRate: number; profitFactor: number; sharpe: number; sampleSize: number; maxDdPct: number };
  mode: Mode;
  registryUrl?: string;
  parent?: string;
  notes?: string;
}

export interface PromotionGateResult { pass: boolean; failures: string[]; targetMode: Mode }

const NEXT_MODE: Record<Mode, Mode | null> = {
  research: 'backtest',
  backtest: 'paper',
  paper: 'shadow',
  shadow: 'demo',
  demo: 'restricted-live',
  'restricted-live': 'live',
  live: 'live',
  'emergency-stop': 'emergency-stop',
};

export function promotionGate(v: ModelVersion, currentBest?: ModelVersion): PromotionGateResult {
  const failures: string[] = [];
  const m = v.metrics;
  const next = NEXT_MODE[v.mode] ?? v.mode;

  // Statistical hurdles vary by target mode
  if (next === 'backtest' && m.sampleSize < 100) failures.push('sample<100 for backtest');
  if (next === 'paper' && m.winRate < 0.5) failures.push('winRate<50% for paper');
  if (next === 'shadow' && (m.profitFactor < 1.1 || m.sampleSize < 200)) failures.push('PF<1.1 or n<200 for shadow');
  if (next === 'demo' && (m.profitFactor < 1.2 || m.sharpe < 0.5 || m.sampleSize < 300)) failures.push('PF/Sharpe/n gate for demo');
  if (next === 'restricted-live' && (m.profitFactor < 1.3 || m.sharpe < 1.0 || m.sampleSize < 500)) failures.push('gate for restricted-live');
  if (next === 'live' && (m.profitFactor < 1.4 || m.sharpe < 1.2 || m.sampleSize < 1000 || m.maxDdPct < -0.15)) failures.push('gate for live');

  // Regression guard: can't promote if worse than current best in same mode
  if (currentBest && v.mode === currentBest.mode) {
    if (m.profitFactor < currentBest.metrics.profitFactor * 0.9) failures.push('PF regression >10%');
    if (m.winRate < currentBest.metrics.winRate - 0.05) failures.push('winRate regression >5pt');
  }

  return { pass: failures.length === 0, failures, targetMode: next };
}

export function rollback(current: ModelVersion, previous: ModelVersion, reason: string): { mode: Mode; version: string; reason: string } {
  return { mode: previous.mode, version: previous.version, reason: `rollback: ${reason}` };
}
