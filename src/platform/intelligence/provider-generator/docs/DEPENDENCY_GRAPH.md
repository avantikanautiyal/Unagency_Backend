# Dependency Graph

```
provider-generator
  ├── shared/result, shared/errors
  └── (templates reference relative paths into providers/<id> leaf)

Does NOT modify:
  openai leaf, runtime, routing, negotiation, model intelligence,
  capability intelligence, evaluation, experience, integration
```

Read-only architectural reference: OpenAI leaf patterns.
