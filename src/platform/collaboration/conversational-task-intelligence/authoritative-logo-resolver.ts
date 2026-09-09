/**
 * P4.9.7 — Authoritative logo resolution for generation integrity.
 * Deterministic candidate merge/dedup and mode selection (no provider calls).
 */

import {
  explicitField,
  type AuthoritativeLogoCandidate,
  type AuthoritativeLogoSpec,
  type CanonicalExecutionSpecification,
} from "./execution-specification";
import type {
  ConversationalClarification,
  LogoClarificationCandidate,
} from "./conversational-task-contract";

export type AuthoritativeLogoResolution = AuthoritativeLogoSpec;

function dedupeCandidates(
  candidates: readonly AuthoritativeLogoCandidate[],
): AuthoritativeLogoCandidate[] {
  const byId = new Map<string, AuthoritativeLogoCandidate>();
  for (const candidate of candidates) {
    const assetId = candidate.assetId.trim();
    if (!assetId) continue;
    const existing = byId.get(assetId);
    if (!existing) {
      byId.set(assetId, Object.freeze({ ...candidate, assetId }));
      continue;
    }
    // Preserve vault provenance when the same asset appears in vault and attachment.
    if (existing.source === "ATTACHMENT" && candidate.source === "VAULT") {
      byId.set(
        assetId,
        Object.freeze({
          ...existing,
          source: "VAULT",
          name: candidate.name ?? existing.name,
          folder: candidate.folder ?? existing.folder,
        }),
      );
    }
  }
  return [...byId.values()];
}

export function resolveAuthoritativeLogo(input: {
  readonly vaultCandidates?: readonly AuthoritativeLogoCandidate[];
  readonly attachmentLogoAssetIds?: readonly string[];
  readonly vaultLogoChoice?: string;
  readonly generateNewRequested?: boolean;
  readonly prior?: AuthoritativeLogoSpec;
}): AuthoritativeLogoResolution {
  if (input.generateNewRequested) {
    return Object.freeze({
      mode: "GENERATE_IF_ABSENT",
      authoritative: false,
    });
  }

  const explicitChoice = input.vaultLogoChoice?.trim();
  if (explicitChoice) {
    const attachmentCandidates: AuthoritativeLogoCandidate[] = (
      input.attachmentLogoAssetIds ?? []
    )
      .map((assetId) => assetId.trim())
      .filter(Boolean)
      .map((assetId) =>
        Object.freeze({
          assetId,
          source: "ATTACHMENT" as const,
        }),
      );
    const merged = dedupeCandidates([
      ...(input.vaultCandidates ?? []),
      ...attachmentCandidates,
    ]);
    const matched = merged.find((candidate) => candidate.assetId === explicitChoice);
    return Object.freeze({
      mode: "USE_EXISTING",
      assetId: explicitChoice,
      source: matched?.source ?? "VAULT",
      authoritative: true,
    });
  }

  const attachmentCandidates: AuthoritativeLogoCandidate[] = (
    input.attachmentLogoAssetIds ?? []
  )
    .map((assetId) => assetId.trim())
    .filter(Boolean)
    .map((assetId) =>
      Object.freeze({
        assetId,
        source: "ATTACHMENT" as const,
      }),
    );

  const merged = dedupeCandidates([
    ...(input.vaultCandidates ?? []),
    ...attachmentCandidates,
  ]);

  if (merged.length === 0) {
    if (
      input.prior?.mode === "NEEDS_SELECTION" &&
      input.prior.candidates?.length
    ) {
      return Object.freeze({
        mode: "NEEDS_SELECTION",
        authoritative: true,
        candidates: input.prior.candidates,
      });
    }
    return Object.freeze({
      mode: "GENERATE_IF_ABSENT",
      authoritative: false,
    });
  }

  if (merged.length === 1) {
    const selected = merged[0]!;
    return Object.freeze({
      mode: "USE_EXISTING",
      assetId: selected.assetId,
      source: selected.source,
      authoritative: true,
    });
  }

  return Object.freeze({
    mode: "NEEDS_SELECTION",
    authoritative: true,
    candidates: Object.freeze(merged),
  });
}

const ORDINAL_INDEX: Readonly<Record<string, number>> = Object.freeze({
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  "1st": 0,
  "2nd": 1,
  "3rd": 2,
  "4th": 3,
  "5th": 4,
});

export function resolveLogoFollowUpFromMessage(input: {
  readonly message: string;
  readonly prior?: AuthoritativeLogoSpec;
}): AuthoritativeLogoResolution | undefined {
  const prior = input.prior;
  if (!prior?.candidates?.length) return undefined;

  const text = input.message.trim();
  const lower = text.toLowerCase();

  if (
    /\b(generate|create|make)\s+(?:a\s+)?new\s+logo\b/i.test(text) ||
    /\bnew\s+logo\s+instead\b/i.test(text)
  ) {
    return Object.freeze({
      mode: "GENERATE_IF_ABSENT",
      authoritative: false,
    });
  }

  if (/\battached\b/i.test(lower) && /\blogo\b/i.test(lower)) {
    const attached = prior.candidates.filter((c) => c.source === "ATTACHMENT");
    if (attached.length === 1) {
      const selected = attached[0]!;
      return Object.freeze({
        mode: "USE_EXISTING",
        assetId: selected.assetId,
        source: "ATTACHMENT",
        authoritative: true,
      });
    }
  }

  if (/\bvault\b/i.test(lower) && /\blogo\b/i.test(lower)) {
    const vaultOnly = prior.candidates.filter((c) => c.source === "VAULT");
    if (vaultOnly.length === 1) {
      const selected = vaultOnly[0]!;
      return Object.freeze({
        mode: "USE_EXISTING",
        assetId: selected.assetId,
        source: "VAULT",
        authoritative: true,
      });
    }
  }

  const ordinalOnly = lower.match(
    /\b(?:use|pick|choose|select)\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+(?:one|logo)?\b/,
  );
  if (ordinalOnly?.[1]) {
    const index = ORDINAL_INDEX[ordinalOnly[1]];
    if (index !== undefined && prior.candidates[index]) {
      const selected = prior.candidates[index]!;
      return Object.freeze({
        mode: "USE_EXISTING",
        assetId: selected.assetId,
        source: selected.source,
        authoritative: true,
      });
    }
  }

  const ordinalMatch = lower.match(
    /\b(?:use|pick|choose|select)\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+logo\b/,
  );
  if (ordinalMatch?.[1]) {
    const index = ORDINAL_INDEX[ordinalMatch[1]];
    if (index !== undefined && prior.candidates[index]) {
      const selected = prior.candidates[index]!;
      return Object.freeze({
        mode: "USE_EXISTING",
        assetId: selected.assetId,
        source: selected.source,
        authoritative: true,
      });
    }
  }

  const vaultLogoMatch = text.match(/\bvault_logo:([a-f0-9]{24})\b/i);
  if (vaultLogoMatch?.[1]) {
    return Object.freeze({
      mode: "USE_EXISTING",
      assetId: vaultLogoMatch[1],
      source: "VAULT",
      authoritative: true,
    });
  }

  const nameHint = lower.match(/\b(?:use|pick|choose)\s+(?:the\s+)?(.+?)\s+logo\b/);
  if (nameHint?.[1]) {
    const hint = nameHint[1].trim();
    const matches = prior.candidates.filter((candidate) => {
      const name = (candidate.name ?? "").toLowerCase();
      return name.includes(hint) || hint.includes(name);
    });
    if (matches.length === 1) {
      const selected = matches[0]!;
      return Object.freeze({
        mode: "USE_EXISTING",
        assetId: selected.assetId,
        source: selected.source,
        authoritative: true,
      });
    }
  }

  return undefined;
}

export function buildLogoClarificationQuestion(
  candidates: readonly AuthoritativeLogoCandidate[],
  brandName?: string,
): string {
  const prefix = brandName?.trim()
    ? `${brandName} has ${candidates.length} logos`
    : "I found multiple logos";
  return `${prefix}. Which one should I use?`;
}

export function logoCandidatesToClarificationChoices(
  candidates: readonly AuthoritativeLogoCandidate[],
): readonly LogoClarificationCandidate[] {
  return Object.freeze(
    candidates.map((candidate, index) =>
      Object.freeze({
        selectionId: `vault_logo:${candidate.assetId}`,
        assetId: candidate.assetId,
        source: candidate.source,
        name: candidate.name?.trim() || `Logo ${index + 1}`,
        folder: candidate.folder,
      }),
    ),
  );
}

export function buildLogoSelectionClarification(input: {
  readonly candidates: readonly AuthoritativeLogoCandidate[];
  readonly resumePrompt?: string;
  readonly brandName?: string;
}): ConversationalClarification {
  return Object.freeze({
    kind: "logo_selection",
    question: buildLogoClarificationQuestion(input.candidates, input.brandName),
    ambiguities: Object.freeze(["logo_selection"]),
    preserveState: true,
    logoCandidates: logoCandidatesToClarificationChoices(input.candidates),
    resumePrompt: input.resumePrompt?.trim() || undefined,
  });
}

export function authoritativeLogoFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): AuthoritativeLogoSpec | undefined {
  if (!metadata) return undefined;
  const raw = metadata.authoritativeLogo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const mode = rec.mode;
  if (
    mode !== "USE_EXISTING" &&
    mode !== "NEEDS_SELECTION" &&
    mode !== "GENERATE_IF_ABSENT"
  ) {
    return undefined;
  }
  return Object.freeze({
    mode,
    assetId: typeof rec.assetId === "string" ? rec.assetId : undefined,
    source:
      rec.source === "VAULT" || rec.source === "ATTACHMENT"
        ? rec.source
        : undefined,
    authoritative: rec.authoritative === true,
    candidates: Array.isArray(rec.candidates)
      ? Object.freeze(
          rec.candidates
            .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
            .map((c) =>
              Object.freeze({
                assetId: String(c.assetId ?? ""),
                source:
                  c.source === "ATTACHMENT" ? ("ATTACHMENT" as const) : ("VAULT" as const),
                name: typeof c.name === "string" ? c.name : undefined,
                folder: typeof c.folder === "string" ? c.folder : undefined,
              }),
            )
            .filter((c) => c.assetId.trim().length > 0),
        )
      : undefined,
  });
}

export function stampAuthoritativeLogoMetadata(
  metadata: Readonly<Record<string, unknown>>,
  logo: AuthoritativeLogoSpec,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...metadata,
    authoritativeLogo: logo,
  };
  if (logo.mode === "USE_EXISTING" && logo.assetId) {
    const existing = Array.isArray(metadata.assetIds)
      ? metadata.assetIds.map(String).filter(Boolean)
      : [];
    out.assetIds = [...new Set([...existing, logo.assetId])];
    out.brandLogoAssetId = logo.assetId;
    out.logoAssetId = logo.assetId;
    out.brandLogoProvenance =
      logo.source === "ATTACHMENT" ? "Prompt attachment logo" : "Brand vault logo";
  }
  if (logo.mode === "NEEDS_SELECTION" && logo.candidates?.length) {
    out.logoChoiceRequired = true;
    out.logoChoiceCandidates = logo.candidates;
  }
  return out;
}

export function enrichExecutionSpecWithAuthoritativeLogo(
  spec: CanonicalExecutionSpecification,
  logo: AuthoritativeLogoSpec,
): CanonicalExecutionSpecification {
  const brandRequirements = [...(spec.brandAssets?.requirements ?? [])];
  if (logo.mode === "USE_EXISTING" && logo.assetId) {
    brandRequirements.push(
      explicitField(
        Object.freeze({
          role: "logo" as const,
          required: true,
          assetId: logo.assetId,
          source: "EXPLICIT_USER" as const,
        }),
        "EXPLICIT_USER",
      ),
    );
  }
  return Object.freeze({
    ...spec,
    brandAssets: brandRequirements.length
      ? Object.freeze({ requirements: Object.freeze(brandRequirements) })
      : spec.brandAssets,
    referenceAssets: Object.freeze({
      logo: explicitField(logo, "EXPLICIT_USER"),
    }),
    resolutionState:
      logo.mode === "NEEDS_SELECTION" ? "CLARIFICATION_REQUIRED" : spec.resolutionState,
    clarificationQuestion:
      logo.mode === "NEEDS_SELECTION" && logo.candidates?.length
        ? buildLogoClarificationQuestion(logo.candidates)
        : spec.clarificationQuestion,
    executionInstruction: spec.executionInstruction,
  });
}
