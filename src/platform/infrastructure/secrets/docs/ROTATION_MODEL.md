# Rotation Model

Provider-agnostic rotation via `rotateSecret()`:

1. Transition → `rotating`
2. Generate or accept `newValue`
3. Encrypt + put to backend
4. Bump version / key version
5. Transition → `active`
6. On failure: restore prior lifecycle + monitor rotation failure

Provider Identity requests rotation through this platform (generic), not vendor-specific logic.
