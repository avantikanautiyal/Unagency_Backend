# Unit Test Summary — Provider Consensus

## Suite

`tests/platform/intelligence/provider-consensus/engine.test.ts`

## Tests (7)

| Test | Assertion |
|------|-----------|
| three → one canonical | winner, output, confidence, explanation |
| best_quality | anthropic wins |
| lowest_cost | gemini wins |
| research_writing | openai writing wins + supporting |
| explainability | perProvider outcomes |
| arbitration | failed discarded |
| no SDK/network | committee strategy succeeds |

## Run

```bash
npx jest tests/platform/intelligence/provider-consensus
```
