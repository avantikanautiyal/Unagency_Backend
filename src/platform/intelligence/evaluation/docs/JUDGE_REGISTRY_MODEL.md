# Judge Registry Model

Judges are plugins (`JudgePluginDescriptor` + `IJudge`).

`DefaultJudgeRegistry`:

- registers all **core** judges (instruction, brand, policy, …) by reference
- registers **domain plugins** (marketing, architecture, medical, …)
- `resolve(kinds)` returns ordered `IJudge[]` for `JudgePipeline`

No hardcoded static pipeline in the dynamic path.
