# Applicability Model

## ApplicabilityConditions

Defines WHERE an experience applies:

- capabilityId, department, industry, taskType
- workflowId, executionStrategy, reasoningStrategy
- promptTemplateId, modelId, providerId
- language, locale, organizationId, workspaceId
- campaignId, projectId, complexityTier, budgetTier

## Derivation Sources

- Experience metadata from extraction
- ExecutionMetadata from planning
- PromptMetadata from optimization inputs
- RoutingDecision provider/model selection

## Location

`contracts/applicability.ts`, `applicability/applicability-engine.ts`
