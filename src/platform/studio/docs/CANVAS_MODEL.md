# Canvas Model

Render-agnostic canvas tree:

```
StudioCanvas
  ├── Sections → Blocks (nested)
  └── Panels (sidebar, toolbar, inspector, properties, bottom, dock, split)
```

| Contract | Role |
|----------|------|
| `StudioCanvas` | Surface + panel wiring + split flag |
| `StudioSection` / `StudioBlock` | Content structure |
| `StudioPanel` | Dockable region descriptors |
| `StudioLayout` / `StudioLayoutRegion` | Spatial ratios |

Frontends map these descriptors to native views; the engine never emits UI code.
