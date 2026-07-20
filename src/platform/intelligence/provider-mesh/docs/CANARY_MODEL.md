# Canary Model

## Recommendations

| Situation | Action |
|-----------|--------|
| Healthy source + experimental target with acceptable signals | `start` at 5–10% |
| Target error high or large score gap | `rollback` at 0% |
| Degraded / rate-limited target | `rollback` |

## Fields

- `sourceProviderId`, `targetProviderId`  
- `percentage`  
- `action`: start | increase | hold | rollback  
- `rollbackRecommended`  
- Explainability rationale  

No traffic is shifted by the mesh.
