# Extension Model

`StudioExtensionManifest` declares plug-ins without modifying the engine:

- `contributesWidgets`
- `contributesPanels`
- `contributesShortcuts`
- `enabled` + version + metadata

Register via `register_extension` / `register_widget` commands. Custom widget
kinds use `custom` plus extension ownership.
