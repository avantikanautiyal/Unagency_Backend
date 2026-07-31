/**
 * M9.2D2 — production Intelligence OS must not call providers from API/controllers.
 */

import * as fs from "fs";
import * as path from "path";

const FORBIDDEN_PRODUCTION_PATHS = [
  "src/platform/api/controllers",
  "src/platform/api/services/execution-api-service.ts",
  "src/platform/intelligence/prompt-compiler",
  "src/platform/business",
  "src/platform/intelligence/evaluation",
  "src/platform/intelligence/cost",
  "src/platform/intelligence/providers/streaming",
];

const FORBIDDEN_IMAGE_SDK_PATTERNS = [
  /api\.bfl\.ai/,
  /api\.ideogram\.ai/,
  /api\.midjourney\.com/,
  /api\.stability\.ai/,
  /generativelanguage\.googleapis\.com.*generateImages/,
  /images\/generations/,
  /images\/edits/,
];

const FORBIDDEN_AUDIO_SDK_PATTERNS = [
  /api\.elevenlabs\.io/,
  /api\.cartesia\.ai/,
  /api\.deepgram\.com/,
  /api\.assemblyai\.com/,
  /api\.play\.ai/,
  /api\.suno\.ai/,
  /api\.udio\.com/,
];

const FORBIDDEN_VIDEO_SDK_PATTERNS = [
  /api\.dev\.runwayml\.com/,
  /api\.klingai\.com/,
  /api\.lumalabs\.ai/,
  /api\.pika\.art/,
  /api\.minimax\.chat/,
  /api\.minimax\.io/,
  /app-api\.pixverse\.ai/,
  /api\.pixverse\.ai/,
  /api\.higgsfield\.ai/,
  /platform\.higgsfield\.ai/,
  /generativelanguage\.googleapis\.com.*predictLongRunning/,
  /v1\/async\/video\/jobs/,
];

const ALLOWED_PATTERNS = [
  /createOpenAIProvider/,
  /ProductionPinnedOpenAIDispatcher/,
  /bootProductionExecution/,
  /OPENAI_API_KEY/,
  /openai\.api_key/,
];

describe("M9.2D2 provider bypass guard", () => {
  it("does not import OpenAI SDK in API execution or prompt compiler paths", () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    const offenders: string[] = [];

    for (const rel of FORBIDDEN_PRODUCTION_PATHS) {
      const target = path.join(repoRoot, rel);
      if (!fs.existsSync(target)) continue;
      scan(target, (file, content) => {
        if (!file.endsWith(".ts")) return;
        if (
          content.includes('from "openai"') ||
          content.includes("from 'openai'") ||
          content.includes("OpenAI(")
        ) {
          const allowed = ALLOWED_PATTERNS.some((p) => p.test(content));
          if (!allowed) offenders.push(path.relative(repoRoot, file));
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("does not call image provider APIs from forbidden production paths", () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    const offenders: string[] = [];

    for (const rel of FORBIDDEN_PRODUCTION_PATHS) {
      const target = path.join(repoRoot, rel);
      if (!fs.existsSync(target)) continue;
      scan(target, (file, content) => {
        if (!file.endsWith(".ts")) return;
        if (FORBIDDEN_IMAGE_SDK_PATTERNS.some((p) => p.test(content))) {
          const allowed = ALLOWED_PATTERNS.some((p) => p.test(content));
          if (!allowed) offenders.push(path.relative(repoRoot, file));
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("does not call video provider APIs from forbidden production paths", () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    const offenders: string[] = [];

    for (const rel of FORBIDDEN_PRODUCTION_PATHS) {
      const target = path.join(repoRoot, rel);
      if (!fs.existsSync(target)) continue;
      scan(target, (file, content) => {
        if (!file.endsWith(".ts")) return;
        if (FORBIDDEN_VIDEO_SDK_PATTERNS.some((p) => p.test(content))) {
          const allowed = ALLOWED_PATTERNS.some((p) => p.test(content));
          if (!allowed) offenders.push(path.relative(repoRoot, file));
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("does not call audio provider APIs from forbidden production paths", () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    const offenders: string[] = [];

    for (const rel of FORBIDDEN_PRODUCTION_PATHS) {
      const target = path.join(repoRoot, rel);
      if (!fs.existsSync(target)) continue;
      scan(target, (file, content) => {
        if (!file.endsWith(".ts")) return;
        if (FORBIDDEN_AUDIO_SDK_PATTERNS.some((p) => p.test(content))) {
          const allowed = ALLOWED_PATTERNS.some((p) => p.test(content));
          if (!allowed) offenders.push(path.relative(repoRoot, file));
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

function scan(
  target: string,
  visit: (file: string, content: string) => void
): void {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    visit(target, fs.readFileSync(target, "utf8"));
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    scan(path.join(target, entry.name), visit);
  }
}
