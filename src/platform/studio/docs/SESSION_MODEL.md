# Session Model

AI work is a `StudioAiSession` referencing:

- Execution ID
- Workspace
- Capability
- Brand
- Knowledge / Brand Brain enrichment ids
- History entry ids
- Evaluation / Experience ids

No provider-specific fields. Session updates only change status and refs.
Gateway requests carry session id in metadata/body for execution correlation.
