# Entity Relationship Model

```
Organization 1──* Workspace 1──* Project
     │                │
     ├──* Department──* Team
     ├──* BusinessUser / Invitation / Membership
     ├──* BrandProfile ── Project.brandId?
     ├──* Campaign (workspace, optional project/brand)
     ├──* Asset
     ├──* KnowledgeRepository 1──* KnowledgeDocument (versioned)
     ├──* PromptTemplate
     ├──* BusinessWorkflow (→ intelligenceWorkflowRef)
     ├──* BusinessExecutionRecord (→ gatewayExecutionId)
     ├──* ApprovalRequest / Comment / Assignment / Activity / Notification
     ├──* Subscription → Plan
     ├──* CreditLedgerEntry / Invoice / Transaction
     ├──* MarketplaceListing / Automation / IntegrationConnection
     └──* OrganizationSettings / AuditLogEntry
```

All relationships are organization-scoped for tenant isolation.
