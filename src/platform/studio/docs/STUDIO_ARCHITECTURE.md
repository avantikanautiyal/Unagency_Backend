# Studio Architecture

## Core idea

One engine. Many studio configurations. Immutable state. Command dispatch.

```
StudioCommand → StudioEngine.dispatch → new StudioState (revision++)
                              ↓
                     history stacks (undo/redo)
                              ↓
                     snapshots (restore)
```

## Modules

| Area | Responsibility |
|------|----------------|
| `contracts/` | Immutable DTOs |
| `engine/` | Command application |
| `templates/` | Canonical studio type configs |
| `state/` | Empty/clone/diff helpers |
| `ai/` | Gateway envelope helpers |
| `extensions/` | Plug-in manifests |
| `widgets/` | Metadata-only descriptors |

## Success criterion

Changing UI frameworks must not require Studio contract changes.
