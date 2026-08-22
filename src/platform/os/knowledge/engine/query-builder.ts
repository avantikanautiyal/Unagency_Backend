/**
 * Deterministic Brief/task → knowledge retrieval query.
 */

export function buildKnowledgeQuery(input: {
  readonly rawPrompt: string;
  readonly briefIntent?: string;
  readonly briefObjective?: string;
  readonly deliverableTypes?: readonly string[];
  readonly capabilityId?: string;
}): string {
  const parts: string[] = [];
  const prompt = input.rawPrompt.replace(/\s+/g, " ").trim();
  if (prompt) parts.push(prompt);

  if (input.briefIntent && input.briefIntent !== "other") {
    parts.push(input.briefIntent.replace(/_/g, " "));
  }
  if (input.briefObjective && input.briefObjective !== prompt) {
    parts.push(input.briefObjective.slice(0, 160));
  }
  for (const d of input.deliverableTypes ?? []) {
    parts.push(d.replace(/_/g, " "));
  }

  // Prefer product/feature signals in the query for launch/announcement tasks.
  const productSignals = prompt.match(
    /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z0-9][A-Za-z0-9]*)*)\b/g
  );
  if (productSignals?.length) {
    parts.push(...productSignals.slice(0, 3));
  }

  const joined = [...new Set(parts.map((p) => p.trim()).filter(Boolean))].join(" ");
  return joined.slice(0, 500);
}
