/**
 * Provider enable gate — requires an explicit *_ENABLED=true (or 1/yes).
 * Credential presence alone does not enable a leaf (commented keys must stay off).
 */

export function isProviderEnableFlagOn(
  env: NodeJS.ProcessEnv,
  enableVar: string,
  hasCredential: boolean
): boolean {
  const flag = env[enableVar]?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return hasCredential;
  return false;
}
