/**
 * Application-level intelligence platform configuration.
 * Sole module allowed to read process.env for intelligence settings.
 */

export interface AppConfig {
  readonly env: "development" | "test" | "production";
  readonly platformName: string;
  readonly platformVersion: string;
  readonly enabled: boolean;
}

function resolveEnv(): AppConfig["env"] {
  const value = process.env.NODE_ENV ?? "development";
  if (value === "production" || value === "test" || value === "development") {
    return value;
  }
  return "development";
}

export function loadAppConfig(): AppConfig {
  return {
    env: resolveEnv(),
    platformName: process.env.INTELLIGENCE_PLATFORM_NAME ?? "UNAGENCY Intelligence Platform",
    platformVersion: process.env.INTELLIGENCE_PLATFORM_VERSION ?? "0.1.0-m0",
    enabled: (process.env.INTELLIGENCE_ENABLED ?? "true").toLowerCase() !== "false",
  };
}
