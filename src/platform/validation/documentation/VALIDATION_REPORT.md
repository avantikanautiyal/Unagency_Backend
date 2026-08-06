# VALIDATION REPORT

Generated: 2026-08-01T16:16:01.384Z

**Run ID:** val_artifacts
**Success:** false
**Duration:** 2107ms

## Scenarios

- **gateway_e2e**: PASS (5 stages)
- **research_merge**: FAIL (6 stages)

## Checks

| Check | Area | Status | Message |
| --- | --- | --- | --- |
| health_orchestrator | health | pass | Validation orchestrator loaded |
| health_production | health | pass | Production validation engine consumable |
| health_gateway | health | pass | Enterprise API Gateway consumable |
| health_brand_brain | health | pass | Brand Brain platform consumable |
| health_knowledge | health | pass | Knowledge Intelligence consumable |
| org_present | tenant | pass | Organization context set |
| gateway_execution | gateway | pass | Gateway accepted execution request |
| skip_ai_execution | execution | pass | Stage covered by gateway path |
| explainability_endpoints | execution_intelligence | pass | Explainability endpoints validated (12) |
| audit_record | audit | pass | Immutable audit record present |
| research_perplexity | provider | pass | perplexity in provider catalog |
| research_exa | provider | pass | exa in provider catalog |
| research_tavily | provider | pass | tavily in provider catalog |
| production_capability_intelligence | execution | fail | OS pipeline validated via scn_research |
| execution_artifacts | execution | fail | Execution artifacts present |
| production_provider_selection | execution | fail | OS pipeline validated via scn_research |
| execution_artifacts | execution | fail | Execution artifacts present |
| production_generation | execution | fail | OS pipeline validated via scn_research |
| execution_artifacts | execution | fail | Execution artifacts present |
| production_evaluation | execution | fail | OS pipeline validated via scn_research |
| execution_artifacts | execution | fail | Execution artifacts present |
| gateway_execution | gateway | pass | Gateway accepted execution request |
