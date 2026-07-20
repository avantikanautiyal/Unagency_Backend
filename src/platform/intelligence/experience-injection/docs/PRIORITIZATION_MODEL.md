# Prioritization Model

## Factors

confidence (20%), historical improvement (15%), evidence (15%), frequency (10%),
human/lifecycle approval (10%), recency (10%), applicability (10%), relevance (10%)

## Output

`PrioritizationScore` with `priority`, `rank`, and factor breakdown.

Compressed selection uses rank order with category diversification caps.

## Location

`prioritization/prioritizer.ts`, `compression/experience-compressor.ts`
