/**
 * Priority 4.5 — Requirement lifecycle (add/modify/replace/remove/revert/reset).
 */

import type {
  ConversationalRequirement,
  RequirementPersistence,
  RequirementSource,
} from "./conversational-task-contract";
import type { SemanticSignals } from "./semantic-signals";
import { extractNegativeConstraintsFromMessage } from "./requirement-enforcement";

export type RequirementOperation =
  | { readonly kind: "ADD"; readonly key: string; readonly value: string }
  | { readonly kind: "MODIFY"; readonly key: string; readonly value: string }
  | { readonly kind: "REPLACE"; readonly key: string; readonly value: string; readonly replacesKey?: string }
  | { readonly kind: "REMOVE"; readonly key: string }
  | { readonly kind: "REVERT"; readonly requirementId?: string }
  | { readonly kind: "RESET" }
  | { readonly kind: "SET_OBJECTIVE"; readonly value: string };

let requirementCounter = 0;

export function resetRequirementCounterForTests(): void {
  requirementCounter = 0;
}

function nextRequirementId(prefix: string): string {
  requirementCounter += 1;
  return `req_${prefix}_${requirementCounter}`;
}

function inferRequirementKey(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(tone|voice|style)\b/.test(lower)) return "tone";
  if (/\b(palette|color|colour)\b/.test(lower)) return "palette";
  if (/\b(audience|target)\b/.test(lower)) return "audience";
  if (/\b(brand)\b/.test(lower)) return "brand";
  if (/\b(cta|call to action)\b/.test(lower)) return "cta";
  if (/\b(headline|title)\b/.test(lower)) return "headline";
  if (/\b(hero)\b/.test(lower)) return "hero";
  if (/\b(layout)\b/.test(lower)) return "layout";
  if (/\b(format|dimensions|size)\b/.test(lower)) return "format";
  if (/\b(platform)\b/.test(lower)) return "platform";
  if (/\b(industry|sector)\b/.test(lower)) return "industry";
  return "constraint";
}

export function parseRequirementOperations(input: {
  readonly message: string;
  readonly signals: SemanticSignals;
}): readonly RequirementOperation[] {
  const text = input.message.trim();
  const ops: RequirementOperation[] = [];

  if (input.signals.isReset) {
    return Object.freeze([{ kind: "RESET" }]);
  }

  const alsoMatch = text.match(/\balso\s+(?:include|add)\s+(.+?)\.?$/i);
  if (alsoMatch?.[1]) {
    ops.push({
      kind: "ADD",
      key: inferRequirementKey(alsoMatch[1]),
      value: alsoMatch[1].trim(),
    });
  }

  const removeMatch = text.match(
    /\b(?:remove|delete|drop|exclude|omit|take out|without)\s+(?:the\s+)?(.+?)\.?$/i,
  );
  if (removeMatch?.[1] && input.signals.isRemoval) {
    ops.push({
      kind: "REMOVE",
      key: inferRequirementKey(removeMatch[1]),
    });
  }

  const replaceMatch = text.match(
    /\b(?:change|replace|swap|use)\s+(?:the\s+)?(.+?)\s+(?:to|with)\s+(.+?)\.?$/i,
  );
  if (replaceMatch?.[1] && replaceMatch[2] && input.signals.isReplacement) {
    const key = inferRequirementKey(replaceMatch[1]);
    ops.push({
      kind: "REPLACE",
      key,
      replacesKey: key,
      value: replaceMatch[2].trim(),
    });
  } else if (
    /\bactually\b/i.test(text) &&
    /\b(use|make|switch)\b/i.test(text)
  ) {
    const actuallyMatch = text.match(
      /\bactually\s+(?:use|make|switch to)\s+(.+?)(?:\s+instead)?\.?$/i,
    );
    if (actuallyMatch?.[1]) {
      const value = actuallyMatch[1].trim();
      const key = /\b(blue|yellow|red|green|black|silver|gold|navy|palette|color)\b/i.test(
        value,
      )
        ? "palette"
        : inferRequirementKey(value);
      ops.push({
        kind: "REPLACE",
        key,
        replacesKey: key,
        value,
      });
    }
  }

  const makeMatch = text.match(
    /\bmake\s+(?:it|the\s+([\w\s]+?))\s+(.+?)\.?$/i,
  );
  if (makeMatch?.[2] && input.signals.isModification && !input.signals.isReplacement) {
    const target = makeMatch[1]?.trim();
    ops.push({
      kind: "MODIFY",
      key: target ? inferRequirementKey(target) : inferRequirementKey(makeMatch[2]),
      value: target ? `${target} ${makeMatch[2].trim()}` : makeMatch[2].trim(),
    });
  }

  const keepMatch = text.match(/\bkeep\s+(?:the\s+)?(.+?)\s+(premium|minimal|editorial|bold|soft)\b/i);
  if (keepMatch?.[1] && keepMatch[2]) {
    ops.push({
      kind: "MODIFY",
      key: inferRequirementKey(keepMatch[1]),
      value: `${keepMatch[1].trim()} ${keepMatch[2].trim()}`,
    });
  }

  if (input.signals.isReversion) {
    ops.push({ kind: "REVERT" });
  }

  for (const neg of extractNegativeConstraintsFromMessage(text)) {
    if (
      !ops.some(
        (o) =>
          o.kind === "ADD" &&
          o.key === "negative_constraint" &&
          "value" in o &&
          o.value === neg.subject,
      )
    ) {
      ops.push({
        kind: "ADD",
        key: "negative_constraint",
        value: neg.subject,
      });
    }
  }

  if (ops.length === 0 && input.signals.isCreation && text.length > 20) {
    ops.push({ kind: "SET_OBJECTIVE", value: text });
  } else if (
    ops.length === 0 &&
    (input.signals.isModification || input.signals.isContinuation) &&
    text.length > 5
  ) {
    ops.push({
      kind: "MODIFY",
      key: inferRequirementKey(text),
      value: text,
    });
  }

  return Object.freeze(ops);
}

export function applyRequirementOperations(input: {
  readonly operations: readonly RequirementOperation[];
  readonly existing: readonly ConversationalRequirement[];
  readonly source: RequirementSource;
  readonly persistence: RequirementPersistence;
  readonly messageId?: string;
  readonly nowIso: string;
}): readonly ConversationalRequirement[] {
  let requirements = [...input.existing];

  for (const op of input.operations) {
    if (op.kind === "RESET") {
      requirements = requirements.map((r) =>
        r.status === "active"
          ? Object.freeze({
              ...r,
              status: "removed" as const,
              supersededAt: input.nowIso,
            })
          : r,
      );
      continue;
    }

    if (op.kind === "REVERT") {
      const superseded = [...requirements]
        .filter((r) => r.status === "superseded")
        .sort((a, b) => (b.supersededAt ?? "").localeCompare(a.supersededAt ?? ""));
      const toRestore = op.requirementId
        ? superseded.find((r) => r.id === op.requirementId)
        : superseded[0];
      if (toRestore) {
        requirements = requirements.map((r) => {
          if (r.key === toRestore.key && r.status === "active") {
            return Object.freeze({
              ...r,
              status: "superseded" as const,
              supersededAt: input.nowIso,
            });
          }
          if (r.id === toRestore.id) {
            return Object.freeze({ ...r, status: "active" as const, supersededAt: undefined });
          }
          return r;
        });
      }
      continue;
    }

    if (op.kind === "REMOVE") {
      const removed = requirements.find(
        (r) => r.key === op.key && r.status === "active",
      );
      requirements = requirements.map((r) =>
        r.key === op.key && r.status === "active"
          ? Object.freeze({ ...r, status: "removed" as const, supersededAt: input.nowIso })
          : r,
      );
      if (removed?.value) {
        const negId = nextRequirementId("neg");
        requirements = [
          ...requirements,
          Object.freeze({
            id: negId,
            key: "negative_constraint",
            value: removed.value,
            source: input.source,
            persistence: input.persistence,
            status: "active",
            introducedAt: input.nowIso,
            introducedMessageId: input.messageId,
          }),
        ];
      }
      continue;
    }

    if (op.kind === "SET_OBJECTIVE") {
      const id = nextRequirementId("objective");
      requirements = [
        ...requirements.map((r) =>
          r.key === "objective" && r.status === "active"
            ? Object.freeze({
                ...r,
                status: "superseded" as const,
                supersededAt: input.nowIso,
                supersededById: id,
              })
            : r,
        ),
        Object.freeze({
          id,
          key: "objective",
          value: op.value,
          source: input.source,
          persistence: input.persistence,
          status: "active",
          introducedAt: input.nowIso,
          introducedMessageId: input.messageId,
        }),
      ];
      continue;
    }

    const replaceKey = op.kind === "REPLACE" ? op.replacesKey ?? op.key : op.key;
    const activeSameKey = requirements.filter(
      (r) => r.key === replaceKey && r.status === "active",
    );
    const newId = nextRequirementId(op.kind.toLowerCase());

    requirements = [
      ...requirements.map((r) =>
        r.key === replaceKey && r.status === "active"
          ? Object.freeze({
              ...r,
              status: "superseded" as const,
              supersededAt: input.nowIso,
              supersededById: newId,
            })
          : r,
      ),
      Object.freeze({
        id: newId,
        key: op.key,
        value: "value" in op ? op.value : "",
        source: input.source,
        persistence: input.persistence,
        status: "active",
        introducedAt: input.nowIso,
        introducedMessageId: input.messageId,
      }),
    ];

    if (op.kind === "ADD" && activeSameKey.length > 0) {
      // ADD with same key becomes additive constraint — keep both unless exact duplicate value
      const last = requirements[requirements.length - 1]!;
      const duplicate = activeSameKey.some((r) => r.value === last.value);
      if (duplicate) {
        requirements = requirements.slice(0, -1);
      }
    }
  }

  return Object.freeze(requirements);
}

export function activeRequirements(
  requirements: readonly ConversationalRequirement[],
): readonly ConversationalRequirement[] {
  return Object.freeze(requirements.filter((r) => r.status === "active"));
}

export function buildEffectiveInstruction(input: {
  readonly objective?: string;
  readonly requirements: readonly ConversationalRequirement[];
  readonly latestUserMessage: string;
}): string {
  const parts: string[] = [];
  if (input.objective) parts.push(input.objective);
  for (const req of input.requirements) {
    if (req.key === "objective") continue;
    parts.push(`${req.key}: ${req.value}`);
  }
  if (parts.length === 0) return input.latestUserMessage.trim();
  const base = parts.join("; ");
  const latest = input.latestUserMessage.trim();
  if (!latest || parts.some((p) => p.includes(latest))) return base;
  return `${base}. ${latest}`;
}
