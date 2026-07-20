# Workspace Model

Hierarchy: Organization → Workspace → Projects / Campaigns → Studios → Tabs / Views / Layouts.

| Concept | Contract |
|---------|----------|
| Workspace | `StudioWorkspace` |
| Project | `StudioProject` |
| Campaign ref | `StudioCampaignRef` |
| Studio | `StudioDefinition` + `StudioTypeId` |
| Tab / View / Layout | `StudioTab`, `StudioView`, `StudioLayout` |
| Pins / Favorites | `StudioPinnedItem`, `StudioFavorite` |

Canonical studio types (configs): Marketing, Brand, Website, Landing Page, Social,
Content, Video, Image, Research, Automation, Analytics, Knowledge, Approval, Admin.
