/** Post-trade review agent: classifies every settled trade and decides whether it
 *  should enter the training set. Uses the outcome + realized MFE/MAE + market context.
 */
export type ReviewLabel =
  | 'good_win'
  | 'good_loss'
  | 'lucky_win'
  | 'bad_loss'
  | 'execution_failure'
  | 'regime_failure'
  | 'model_disagreement'
  | 'insufficient_edge';

export interface ReviewInput {
  pnlPct: number;
  mfePct: number;
  maePct: number;
  confidence: number;
  agreement: number;
  chop: number;
  volRegime: 'low' | 'mid' | 'high' | 'extreme';
  exitReason: 'TP' | 'SL' | 'HORIZON' | string;
  holdBars: number;
  topSignals: number;
}

export interface ReviewResult {
  label: ReviewLabel;
  acceptForTraining: boolean;
  reason: string;
  weightSample: number; // sample weight for training loss
}

export function reviewTrade(inp: ReviewInput): ReviewResult {
  const { pnlPct, mfePct, maePct, confidence, exitReason, chop, volRegime, topSignals, agreement } = inp;
  const won = pnlPct > 0;
  const bigMoveVsExit = (mfePct - Math.abs(maePct)) > 0.4;

  if (volRegime === 'extreme') return { label: 'regime_failure', acceptForTraining: false, reason: 'extreme vol regime', weightSample: 0 };
  if (chop > 70) return { label: 'regime_failure', acceptForTraining: false, reason: 'range regime chop>70', weightSample: 0 };

  if (won && exitReason === 'TP' && confidence >= 0.5 && topSignals >= 2) {
    return { label: 'good_win', acceptForTraining: true, reason: 'clean TP with committee agreement', weightSample: 1.0 };
  }
  if (won && bigMoveVsExit && confidence < 0.4) {
    return { label: 'lucky_win', acceptForTraining: true, reason: 'unexpected TP; low confidence', weightSample: 0.5 };
  }
  if (!won && exitReason === 'SL' && confidence >= 0.5 && topSignals >= 2 && agreement >= 0.6) {
    return { label: 'good_loss', acceptForTraining: true, reason: 'setup was right, market moved against; keep for calibration', weightSample: 0.7 };
  }
  if (!won && exitReason === 'SL' && confidence < 0.4) {
    return { label: 'bad_loss', acceptForTraining: true, reason: 'low-conviction loser; use as negative sample', weightSample: 1.2 };
  }
  if (!won && agreement < 0.55) {
    return { label: 'model_disagreement', acceptForTraining: false, reason: 'committee split', weightSample: 0 };
  }
  if (exitReason === 'HORIZON' && Math.abs(pnlPct) < 0.02) {
    return { label: 'insufficient_edge', acceptForTraining: false, reason: 'horizon exit with no move', weightSample: 0 };
  }
  return { label: 'good_loss', acceptForTraining: true, reason: 'default label', weightSample: 0.5 };
}

export function batchReview(trades: ReviewInput[]): { labels: Record<ReviewLabel, number>; results: ReviewResult[]; acceptedCount: number } {
  const labels: Record<ReviewLabel, number> = { good_win: 0, good_loss: 0, lucky_win: 0, bad_loss: 0, execution_failure: 0, regime_failure: 0, model_disagreement: 0, insufficient_edge: 0 };
  const results: ReviewResult[] = [];
  let accepted = 0;
  for (const t of trades) {
    const r = reviewTrade(t);
    labels[r.label]++;
    if (r.acceptForTraining) accepted++;
    results.push(r);
  }
  return { labels, results, acceptedCount: accepted };
}
