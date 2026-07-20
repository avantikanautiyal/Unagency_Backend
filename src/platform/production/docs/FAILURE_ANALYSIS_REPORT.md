# Failure Analysis Report

On validation failure, `analyzeFailure` emits:

- Root cause
- Stage failure (from Integration trace when available)
- Responsible module (mapped from stage)
- Suggested fix
- Severity
- Failed check details

**No automatic repair** — operators act on suggestions only.
