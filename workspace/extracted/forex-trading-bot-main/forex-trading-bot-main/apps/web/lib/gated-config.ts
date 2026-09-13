/** Live promotion of gated_v8 research thresholds (75% in-sample, 73-75% WF). */
export const GATED_V8 = {
  label: 'gated_v8',
  AGREE: 0.55,
  NET: 0.1,
  SL_M: 2.0,
  TP_M: 0.4,
  REQUIRE_TOP: 2,
  CHOP_MIN: 30,
  CHOP_MAX: 70,
  BLENDER_MIN: 0.52,
} as const;

export function chopAllowed(chop: number, cfg = GATED_V8): boolean {
  if (!Number.isFinite(chop)) return true;
  return chop >= cfg.CHOP_MIN && chop <= cfg.CHOP_MAX;
}
