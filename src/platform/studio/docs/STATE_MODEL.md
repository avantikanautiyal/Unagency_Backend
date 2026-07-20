# State Model

`StudioState` is a single immutable revisioned document covering workspaces,
canvases, sessions, activities, collaboration, widgets, and extensions.

| Capability | Mechanism |
|------------|-----------|
| Undo / Redo | History stacks of prior states |
| History list | `StudioHistoryEntry` |
| Snapshots | `StudioSnapshot` + restore |
| Compare | `diffStates` → `StudioStateDiff.changedKeys` |

Every mutating command increments `revision` (except pure undo/redo swaps).
