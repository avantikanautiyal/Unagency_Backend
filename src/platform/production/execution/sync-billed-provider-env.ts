/**
 * Align process.env AI provider keys with uncommented lines in `.env`.
 *
 * dotenv does not unset variables that were already in the shell when a key is
 * later commented out. Leftover GROQ/XAI/BFL credentials would otherwise still
 * register as LIVE. This sync deletes known provider env vars that are not
 * actively assigned (uncommented) in the project `.env`.
 */

import * as fs from "fs";
import * as path from "path";
import { ALL_TEXT_PROVIDER_ENV_SPECS } from "./text-provider-env";
import { ALL_IMAGE_PROVIDER_SPECS } from "../../providers/image/configs/verified-image-provider-specs";
import { ALL_VIDEO_PROVIDER_SPECS } from "../../providers/video/configs/verified-video-provider-specs";
import { ALL_AUDIO_PROVIDER_SPECS } from "../../providers/audio/configs/verified-audio-provider-specs";
import { ALL_RESEARCH_PROVIDER_SPECS } from "../../providers/research/configs/verified-research-provider-specs";
import { ALL_EMBEDDING_PROVIDER_SPECS } from "../../providers/embedding/configs/verified-embedding-provider-specs";

const EXTRA_PROVIDER_ENV_VARS = [
  "GOOGLE_API_KEY",
  "GOOGLE_ENABLED",
  "GEMINI_API_KEY",
  "GEMINI_ENABLED",
  "KLING_API_KEY",
  "KLING_ACCESS_KEY",
  "KLING_ENABLED",
  "SEEDANCE_API_KEY",
  "SEEDANCE_ENABLED",
] as const;

export function parseUncommentedEnvKeys(contents: string): Set<string> {
  const keys = new Set<string>();
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key) keys.add(key);
  }
  return keys;
}

export function collectKnownProviderEnvVarNames(): readonly string[] {
  const names = new Set<string>(EXTRA_PROVIDER_ENV_VARS);
  for (const spec of ALL_TEXT_PROVIDER_ENV_SPECS) {
    names.add(spec.credentialEnvVar);
    names.add(spec.enableEnvVar);
  }
  for (const spec of ALL_IMAGE_PROVIDER_SPECS) {
    names.add(spec.credentialEnvVar);
    names.add(spec.enableEnvVar);
  }
  for (const spec of ALL_VIDEO_PROVIDER_SPECS) {
    names.add(spec.credentialEnvVar);
    names.add(spec.enableEnvVar);
    if (spec.accessKeyEnvVar) names.add(spec.accessKeyEnvVar);
    if (spec.secretEnvVar) names.add(spec.secretEnvVar);
  }
  for (const spec of ALL_AUDIO_PROVIDER_SPECS) {
    names.add(spec.credentialEnvVar);
    names.add(spec.enableEnvVar);
  }
  for (const spec of ALL_RESEARCH_PROVIDER_SPECS) {
    names.add(spec.credentialEnvVar);
    names.add(spec.enableEnvVar);
  }
  for (const spec of ALL_EMBEDDING_PROVIDER_SPECS) {
    names.add(spec.credentialEnvVar);
    names.add(spec.enableEnvVar);
  }
  return Array.from(names).sort();
}

/**
 * Delete known provider env vars that are not uncommented in `.env`.
 * Returns the names that were cleared (never values).
 */
export function clearCommentedProviderEnvVars(
  envFileContents: string,
  env: NodeJS.ProcessEnv = process.env
): readonly string[] {
  const uncommented = parseUncommentedEnvKeys(envFileContents);
  const cleared: string[] = [];
  for (const key of collectKnownProviderEnvVarNames()) {
    if (!uncommented.has(key) && env[key] !== undefined) {
      delete env[key];
      cleared.push(key);
    }
  }
  return cleared;
}

export function syncBilledProviderEnvFromDotenvFile(
  envPath: string = path.resolve(process.cwd(), ".env"),
  env: NodeJS.ProcessEnv = process.env
): readonly string[] {
  if (!fs.existsSync(envPath)) return [];
  const contents = fs.readFileSync(envPath, "utf8");
  return clearCommentedProviderEnvVars(contents, env);
}
