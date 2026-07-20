# Collaboration Model

| Feature | Contract |
|---------|----------|
| Comments + mentions | `StudioComment` |
| Presence | `StudioPresence` |
| Review / approvals | `StudioApprovalRequest` |
| Notifications | `StudioNotification` |
| Shared workspaces | Same `StudioWorkspace` with multi-user presence |

Approvals cycle: draft → requested → approved | rejected | changes_requested.
