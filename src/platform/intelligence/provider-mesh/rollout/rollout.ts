/**
 * Rollout percentage helpers (advisory).
 */

export function recommendRolloutPercent(score: number, rollback: boolean): number {
  if (rollback) return 0;
  if (score >= 0.8) return 25;
  if (score >= 0.6) return 10;
  if (score >= 0.4) return 5;
  return 0;
}
