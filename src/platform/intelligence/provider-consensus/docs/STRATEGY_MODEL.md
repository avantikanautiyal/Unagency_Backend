# Strategy Model

| Strategy | Behavior |
|----------|----------|
| single_winner | Top composite rank, no merge |
| highest_confidence | Max confidence score |
| best_quality | Max quality dimension |
| lowest_cost / lowest_latency | Min cost/latency |
| weighted_voting / majority_vote | Aggregate votes |
| research_writing | research → writing (+ reviewer/verifier) |
| reviewer_pattern | Primary + reviewers |
| committee_pattern | Peer committee merge |
| hierarchical | verifier > reviewer > writing > research |
| hybrid | Quality winner + supporting merge |

## Location

`strategies/strategy-registry.ts`
