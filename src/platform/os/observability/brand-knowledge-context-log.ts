/**
 * Tabular dev logs — what Brand + Knowledge inject into each prompt.
 * No secrets; truncates long values for terminal readability.
 */

import type { BrandContext } from "../brand/contracts/brand-context";
import type { KnowledgeContext } from "../knowledge/contracts/knowledge-context";
import { brandContextToMetadata } from "../brand/adapters/brand-to-execution";
import { knowledgeContextToMetadata } from "../knowledge/adapters/knowledge-to-execution";
import { renderBrandContextBlock } from "../brand/engine/brand-context-renderer";
import { renderKnowledgeContextBlock } from "../knowledge/engine/knowledge-context-renderer";

const MAX_CELL = 72;
const MAX_PROMPT_PREVIEW = 160;

export interface BrandKnowledgeContextLogInput {
  readonly requestId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly capabilityId?: string;
  readonly brandId?: string;
  readonly promptBeforeContext: string;
  readonly promptAfterBrand?: string;
  readonly promptAfterKnowledge?: string;
  readonly brandContext?: BrandContext;
  readonly knowledgeContext?: KnowledgeContext;
  readonly brandSkipped?: boolean;
  readonly knowledgeSkipped?: boolean;
}

interface TableRow {
  readonly section: string;
  readonly field: string;
  readonly value: string;
}

function truncate(value: string, max = MAX_CELL): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}…`;
}

function pushRow(
  rows: TableRow[],
  section: string,
  field: string,
  value: string | undefined | null
): void {
  const v = value?.trim();
  if (!v) return;
  rows.push({ section, field, value: truncate(v) });
}

function pushListRow(
  rows: TableRow[],
  section: string,
  field: string,
  values: readonly string[] | undefined
): void {
  if (!values?.length) return;
  rows.push({ section, field, value: truncate(values.join(", ")) });
}

export function collectBrandInjectionRows(ctx: BrandContext): TableRow[] {
  const rows: TableRow[] = [];
  const section = "Brand";

  pushRow(rows, section, "status", ctx.status);
  pushRow(rows, section, "brandId", ctx.brandId);
  pushRow(rows, section, "completeness", ctx.completeness.overall);
  pushRow(rows, section, "contextHash", ctx.contextHash);

  if (ctx.status === "MISSING" || ctx.status === "EMPTY" || ctx.status === "INVALID") {
    pushRow(
      rows,
      section,
      "note",
      ctx.status === "INVALID"
        ? "Brand context invalid — no brand block injected"
        : "No client brand applied — unbranded guardrail block only"
    );
    return rows;
  }

  pushRow(rows, section, "Brand name", ctx.identity.name);
  pushRow(rows, section, "Industry", ctx.identity.industry);
  pushRow(rows, section, "Mission", ctx.identity.mission);
  pushRow(rows, section, "Vision", ctx.identity.vision);
  pushRow(rows, section, "Tone", ctx.tone.tone);
  pushListRow(rows, section, "Tone adjectives", ctx.tone.adjectives);
  pushRow(rows, section, "Voice", ctx.voice.voice);
  pushRow(rows, section, "Personality", ctx.voice.personality);
  pushRow(rows, section, "Writing style", ctx.voice.writingStyle);
  pushRow(rows, section, "Positioning", ctx.positioning.statement);
  pushListRow(rows, section, "Differentiators", ctx.positioning.differentiators);
  pushRow(rows, section, "Audience", ctx.audience.primary);
  pushListRow(rows, section, "Preferred vocabulary", ctx.vocabulary.preferred);
  pushListRow(rows, section, "Words to avoid", ctx.vocabulary.avoid);
  pushRow(rows, section, "Messaging guidelines", ctx.messaging.guidelines);
  pushRow(rows, section, "CTA style", ctx.messaging.ctaStyle ?? ctx.ctaRules);
  pushRow(rows, section, "Formatting rules", ctx.messaging.formattingRules);
  pushRow(rows, section, "Emoji policy", ctx.messaging.emojiPolicy);
  pushListRow(rows, section, "Colors", ctx.visualIdentity.colors);
  pushListRow(rows, section, "Primary colors", ctx.visualIdentity.primaryColors);
  pushListRow(rows, section, "Secondary colors", ctx.visualIdentity.secondaryColors);
  pushRow(rows, section, "Typography", ctx.visualIdentity.typography);
  pushRow(rows, section, "Logo rules", ctx.visualIdentity.logoRules);
  pushRow(rows, section, "Photography style", ctx.visualIdentity.photographyStyle);
  pushRow(rows, section, "Illustration style", ctx.visualIdentity.illustrationStyle);
  pushRow(rows, section, "Social visual style", ctx.visualIdentity.socialStyle);
  pushRow(rows, section, "AI rules", ctx.creativePrinciples.aiRules);
  pushListRow(rows, section, "Prohibited patterns", ctx.prohibitedPatterns);
  pushListRow(rows, section, "Preferred patterns", ctx.preferredPatterns);

  if (ctx.assetReferences.length) {
    pushRow(
      rows,
      section,
      "Assets",
      ctx.assetReferences
        .map((a) => `${a.type}:${a.assetId}${a.name ? `(${a.name})` : ""}`)
        .join("; ")
    );
  }

  if (ctx.missingInformation.length) {
    pushRow(
      rows,
      section,
      "Missing fields",
      ctx.missingInformation.map((m) => m.key).join(", ")
    );
  }

  const meta = brandContextToMetadata(ctx);
  pushRow(rows, section, "metadata.styleInstructions", String(meta.styleInstructions ?? ""));
  if (Array.isArray(meta.negativeInstructions) && meta.negativeInstructions.length) {
    pushRow(
      rows,
      section,
      "metadata.negativeInstructions",
      meta.negativeInstructions.join(" | ")
    );
  }

  return rows;
}

export function collectKnowledgeInjectionRows(ctx: KnowledgeContext): TableRow[] {
  const rows: TableRow[] = [];
  const section = "Knowledge";

  pushRow(rows, section, "status", ctx.status);
  pushRow(rows, section, "query", ctx.query);
  pushRow(rows, section, "contextHash", ctx.contextHash);
  pushRow(rows, section, "knowledgeVersion", ctx.knowledgeVersion);

  if (
    ctx.status === "EMPTY" ||
    ctx.status === "MISSING" ||
    ctx.status === "FAILED" ||
    ctx.status === "CONFLICTED"
  ) {
    const note =
      ctx.status === "FAILED"
        ? ctx.failureReason ?? "Knowledge store unavailable"
        : ctx.status === "CONFLICTED"
          ? "Conflicting facts — guardrail block injected"
          : "No knowledge retrieved for this prompt";
    pushRow(rows, section, "note", note);
    if (ctx.conflicts.length) {
      pushRow(
        rows,
        section,
        "conflicts",
        ctx.conflicts.map((c) => `${c.key}[${c.values.join("|")}]`).join("; ")
      );
    }
    return rows;
  }

  for (const fact of ctx.facts.slice(0, 12)) {
    pushRow(
      rows,
      section,
      `fact:${fact.key}`,
      `${fact.value} (confidence=${fact.confidence.toFixed(2)}, source=${fact.provenance})`
    );
  }
  if (ctx.facts.length > 12) {
    pushRow(rows, section, "facts (more)", `+${ctx.facts.length - 12} additional facts omitted`);
  }

  for (const chunk of ctx.retrievedChunks.slice(0, 6)) {
    pushRow(
      rows,
      section,
      `chunk:${chunk.title || chunk.chunkId}`,
      truncate(chunk.content, 96)
    );
    pushRow(
      rows,
      section,
      `chunk meta:${chunk.chunkId}`,
      `score=${chunk.retrievalScore.toFixed(2)} method=${chunk.retrievalMethod} doc=${chunk.documentId}`
    );
  }
  if (ctx.retrievedChunks.length > 6) {
    pushRow(
      rows,
      section,
      "chunks (more)",
      `+${ctx.retrievedChunks.length - 6} additional chunks omitted`
    );
  }

  if (ctx.sourceReferences.length) {
    pushRow(rows, section, "sourceReferences", ctx.sourceReferences.slice(0, 10).join(", "));
  }

  const meta = knowledgeContextToMetadata(ctx);
  if (Array.isArray(meta.knowledgeFactKeys) && meta.knowledgeFactKeys.length) {
    pushRow(rows, section, "metadata.factKeys", meta.knowledgeFactKeys.join(", "));
  }

  return rows;
}

function columnWidth(rows: TableRow[], key: "section" | "field" | "value", min: number): number {
  const longest = rows.reduce(
    (max, row) => Math.max(max, row[key].length),
    key === "section" ? "Knowledge".length : key === "field" ? "metadata.styleInstructions".length : 0
  );
  return Math.min(MAX_CELL, Math.max(min, longest));
}

function renderTable(rows: TableRow[]): string[] {
  if (rows.length === 0) {
    return ["  (no brand or knowledge fields injected)"];
  }

  const sectionW = columnWidth(rows, "section", 10);
  const fieldW = columnWidth(rows, "field", 22);
  const valueW = columnWidth(rows, "value", 40);
  const sep = `├${"─".repeat(sectionW + 2)}┬${"─".repeat(fieldW + 2)}┬${"─".repeat(valueW + 2)}┤`;
  const top = `┌${"─".repeat(sectionW + 2)}┬${"─".repeat(fieldW + 2)}┬${"─".repeat(valueW + 2)}┐`;
  const bottom = `└${"─".repeat(sectionW + 2)}┴${"─".repeat(fieldW + 2)}┴${"─".repeat(valueW + 2)}┘`;

  const padCell = (text: string, width: number) =>
    ` ${text.padEnd(width)} `;

  const lines = [
    top,
    `${padCell("Section", sectionW)}│${padCell("Field", fieldW)}│${padCell("Injected value", valueW)}│`,
    sep,
  ];

  for (const row of rows) {
    lines.push(
      `${padCell(row.section, sectionW)}│${padCell(row.field, fieldW)}│${padCell(row.value, valueW)}│`
    );
  }
  lines.push(bottom);
  return lines;
}

function blockSize(label: string, before: string, after: string | undefined): string {
  if (!after || after === before) return `${label}: +0 chars`;
  const delta = after.length - before.length;
  return `${label}: ${before.length} → ${after.length} chars (+${delta})`;
}

export function formatBrandKnowledgeContextTable(
  input: BrandKnowledgeContextLogInput
): string {
  const rows: TableRow[] = [];

  if (input.brandSkipped) {
    rows.push({ section: "Brand", field: "status", value: "skipped" });
  } else if (input.brandContext) {
    rows.push(...collectBrandInjectionRows(input.brandContext));
  } else {
    rows.push({ section: "Brand", field: "status", value: "not resolved" });
  }

  if (input.knowledgeSkipped) {
    rows.push({ section: "Knowledge", field: "status", value: "skipped" });
  } else if (input.knowledgeContext) {
    rows.push(...collectKnowledgeInjectionRows(input.knowledgeContext));
  } else {
    rows.push({ section: "Knowledge", field: "status", value: "not resolved" });
  }

  const promptPreview = truncate(input.promptBeforeContext, MAX_PROMPT_PREVIEW);
  const brandBlockChars = input.brandContext
    ? renderBrandContextBlock(input.brandContext).length
    : 0;
  const knowledgeBlockChars = input.knowledgeContext
    ? renderKnowledgeContextBlock(input.knowledgeContext).length
    : 0;

  const header = [
    "Brand & Knowledge context injection (per prompt)",
    `requestId=${input.requestId} executionId=${input.executionId}`,
    `org=${input.organizationId}${input.brandId ? ` brandId=${input.brandId}` : ""}${
      input.capabilityId ? ` capability=${input.capabilityId}` : ""
    }`,
    `prompt preview: ${promptPreview}`,
    blockSize("prompt", input.promptBeforeContext, input.promptAfterKnowledge ?? input.promptAfterBrand),
    blockSize("after brand", input.promptBeforeContext, input.promptAfterBrand),
    blockSize("after knowledge", input.promptAfterBrand ?? input.promptBeforeContext, input.promptAfterKnowledge),
    `rendered blocks: brand=${brandBlockChars} chars knowledge=${knowledgeBlockChars} chars`,
    "",
    ...renderTable(rows),
  ];

  return header.join("\n");
}

export function logBrandKnowledgeContextTable(
  input: BrandKnowledgeContextLogInput
): void {
  const table = formatBrandKnowledgeContextTable(input);
  for (const line of table.split("\n")) {
    console.log(`[UNAGENCY OS] ${line}`);
  }
}
