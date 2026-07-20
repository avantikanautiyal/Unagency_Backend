# Studio Engine — Unit Tests

Suite: `tests/platform/studio/studio-engine.test.ts`

| Case | Coverage |
|------|----------|
| Workspace lifecycle | create → studio/tabs/layout/panels |
| Canvas / panels | upsert canvas, visibility toggle |
| Sessions | AI session refs, no provider leakage |
| Activities / timeline | user + AI activities ordered |
| History / undo-redo / snapshots | pin undo/redo; restore checkpoint |
| Widgets / extensions | register without engine fork |
| Studio types | all canonical configs listed |
| Gateway-only | `/v1/executions` envelope |
