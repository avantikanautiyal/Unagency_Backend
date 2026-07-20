# Shadow Model

## Purpose

Recommend background (offline) comparison of a secondary provider against a
primary — **without** executing either.

## Actions

| Action | When |
|--------|------|
| `recommend` | Experimental candidate vs top primary |
| `compare` | Healthy eligible secondary |
| `hold` | Unavailable / maintenance / deprecated |

## Comparison metadata

Includes score deltas, latency deltas, and `execution: false` marker.
