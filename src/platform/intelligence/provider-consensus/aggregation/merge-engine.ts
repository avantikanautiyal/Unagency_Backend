/**
 * Merge engine — never merges blindly; mode-driven and explainable.
 */

import { success, type Result } from "../../shared/result";
import type { ConsensusCandidate } from "../contracts/candidate";
import type { MergeMode } from "../contracts/enums";
import type { IMergeEngine } from "../interfaces/consensus";

function contentOf(c: ConsensusCandidate): unknown {
  return c.execution.response?.output?.content ?? c.execution.response?.output ?? {};
}

export class DefaultMergeEngine implements IMergeEngine {
  merge(
    primary: ConsensusCandidate,
    supporting: readonly ConsensusCandidate[],
    mode: MergeMode
  ): Result<Readonly<Record<string, unknown>>> {
    const primaryContent = contentOf(primary);
    const supportContents = supporting.map(contentOf);

    switch (mode) {
      case "none":
        return success(
          Object.freeze({
            content: primaryContent,
            source: primary.providerId,
            mergeMode: mode,
          })
        );

      case "paragraphs":
      case "summaries": {
        const paragraphs = [stringify(primaryContent), ...supportContents.map(stringify)]
          .map((t) => t.trim())
          .filter(Boolean);
        return success(
          Object.freeze({
            content: paragraphs.join("\n\n"),
            sources: [primary.providerId, ...supporting.map((s) => s.providerId)],
            mergeMode: mode,
          })
        );
      }

      case "json":
      case "structured": {
        const merged: Record<string, unknown> = {
          ...(asObject(primaryContent) ?? { value: primaryContent }),
        };
        for (const extra of supportContents) {
          const obj = asObject(extra);
          if (obj) Object.assign(merged, obj);
        }
        return success(
          Object.freeze({
            content: merged,
            sources: [primary.providerId, ...supporting.map((s) => s.providerId)],
            mergeMode: mode,
          })
        );
      }

      case "citations":
        return success(
          Object.freeze({
            content: primaryContent,
            citations: supportContents.map((c, i) => ({
              providerId: supporting[i]?.providerId,
              excerpt: stringify(c).slice(0, 200),
            })),
            mergeMode: mode,
          })
        );

      case "code":
        return success(
          Object.freeze({
            content: stringify(primaryContent),
            alternatives: supportContents.map(stringify),
            mergeMode: mode,
          })
        );

      case "reasoning":
        return success(
          Object.freeze({
            content: primaryContent,
            reasoningTrace: [
              { providerId: primary.providerId, text: stringify(primaryContent) },
              ...supporting.map((s) => ({
                providerId: s.providerId,
                text: stringify(contentOf(s)),
              })),
            ],
            mergeMode: mode,
          })
        );

      default:
        return success(
          Object.freeze({
            content: primaryContent,
            source: primary.providerId,
            mergeMode: "none" as MergeMode,
          })
        );
    }
  }
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}
