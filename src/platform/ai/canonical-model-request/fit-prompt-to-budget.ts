/**
 * Fit a labeled prompt (`===== TITLE =====` sections) under a provider's hard
 * character cap without losing the instructions that drive the output.
 *
 * Order of reduction:
 * 1. Lossless whitespace compaction (pretty JSON indentation, blank lines).
 * 2. Trim low-priority context sections, least important first.
 * 3. Last resort: keep head + tail, drop the middle — the head carries the user
 *    instruction / task / direction, the tail carries appended output
 *    requirements and hard constraints.
 */

const SECTION_HEADER = /^===== (.+?) =====$/gm;

/** Context sections trimmed first → last. Anything not listed is protected. */
const TRIMMABLE_SECTIONS: readonly string[] = [
  "UPSTREAM ARTIFACTS",
  "WORKING MEMORY",
  "RESOLVED REFERENCES",
  "MULTIMODAL CONTEXT",
  "CDF PHASE",
  "ACTIVE BRIEF",
  "PRODUCT GROUNDING",
  "APPROVED DECISIONS",
  "SELECTIONS",
  "BRAND CONTEXT",
];

const MIN_SECTION_BODY = 400;
const TAIL_SHARE = 0.3;

export type PromptBudgetReport = {
  readonly originalLength: number;
  readonly compactedLength: number;
  readonly finalLength: number;
  readonly trimmedSections: readonly string[];
  readonly middleCut: boolean;
};

type Segment = { title: string | null; header: string; body: string };

function compactWhitespace(prompt: string): string {
  return prompt
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSections(prompt: string): Segment[] {
  const segments: Segment[] = [];
  const matches = [...prompt.matchAll(SECTION_HEADER)];
  const firstIndex = matches[0]?.index ?? prompt.length;
  if (firstIndex > 0) {
    segments.push({ title: null, header: "", body: prompt.slice(0, firstIndex) });
  }
  matches.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = matches[i + 1]?.index ?? prompt.length;
    segments.push({ title: m[1]!.trim(), header: m[0], body: prompt.slice(start, end) });
  });
  return segments;
}

function joinSections(segments: readonly Segment[]): string {
  return segments.map((s) => `${s.header}${s.body}`).join("");
}

function cutMiddle(prompt: string, maxLength: number): string {
  const marker = "\n\n[… context omitted to fit model prompt limit …]\n\n";
  const room = maxLength - marker.length;
  const tail = Math.floor(room * TAIL_SHARE);
  const head = room - tail;
  return `${prompt.slice(0, head)}${marker}${prompt.slice(prompt.length - tail)}`;
}

export function fitPromptToBudget(
  prompt: string,
  maxLength: number,
): { prompt: string; report?: PromptBudgetReport } {
  if (prompt.length <= maxLength) return { prompt };

  const compacted = compactWhitespace(prompt);
  const trimmedSections: string[] = [];
  let current = compacted;

  if (current.length > maxLength) {
    const segments = splitSections(current);
    let length = current.length;
    for (const title of TRIMMABLE_SECTIONS) {
      if (length <= maxLength) break;
      const seg = segments.find((s) => s.title === title);
      if (!seg || seg.body.length <= MIN_SECTION_BODY) continue;
      const excess = length - maxLength;
      const marker = `\n[… ${title.toLowerCase()} trimmed to fit model prompt limit …]\n\n`;
      const keep = Math.max(MIN_SECTION_BODY, seg.body.length - excess - marker.length);
      if (keep >= seg.body.length) continue;
      const nextBody = `${seg.body.slice(0, keep).trimEnd()}${marker}`;
      length -= seg.body.length - nextBody.length;
      seg.body = nextBody;
      trimmedSections.push(title);
    }
    current = joinSections(segments);
  }

  const middleCut = current.length > maxLength;
  if (middleCut) current = cutMiddle(current, maxLength);

  return {
    prompt: current,
    report: {
      originalLength: prompt.length,
      compactedLength: compacted.length,
      finalLength: current.length,
      trimmedSections,
      middleCut,
    },
  };
}
