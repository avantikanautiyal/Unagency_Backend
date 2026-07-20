# Generator Architecture

```
ManifestSpec
   │
   ├─ Validator
   ├─ Capability Planner
   ├─ Model Resolver Planner
   ├─ Certification Planner
   └─ Canonical Template Renderer ──► GeneratedFileArtifact[]
                │
                ▼
        GeneratedProviderPackage
                │
                ▼
     Integration / Certification checklists
```

Reference leaf: `providers/openai/` (frozen, not rewritten by generator).
