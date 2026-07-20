# Widget Model

Widgets are **metadata only** (`StudioWidgetDescriptor`).

Kinds: campaign_overview, execution_status, brand_summary, knowledge_explorer,
analytics, approvals, tasks, timeline, assets, custom.

Fields: title, dataBinding, sizeHint, refreshPolicy, optional extensionId.

Frontends bind data via Gateway using `dataBinding` hints — never via Studio→OS.
