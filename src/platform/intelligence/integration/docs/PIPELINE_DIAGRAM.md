# Pipeline Diagram

```
Raw Request
    │  IRawRequestTaskBridge
    ▼
Task Intelligence
    │  ITaskCapabilityBridge
    ▼
Capability Intelligence
    │  ICapabilityAgentBridge
    ▼
Agent Planning
    │  IAgentWorkflowBridge
    ▼
Workflow Intelligence
    │  IWorkflowGovernanceBridge
    ▼
Execution Governance
    │  IExperienceInjectionBridge
    ▼
Experience Injection
    │  ICapabilityExecutionBridge  (IGovernanceExecutionBridge available)
    ▼
Execution Intelligence
    │  IExecutionModelBridge
    ▼
Model Intelligence
    │  IModelNegotiationBridge
    ▼
Negotiation
    │  INegotiationRoutingBridge
    ▼
Routing
    │  IRoutingRuntimeBridge
    ▼
Provider Runtime
    │  IRuntimeConsensusBridge
    ▼
Consensus
    │  IConsensusEvaluationBridge
    ▼
Evaluation
    │  IEvaluationIntelligenceBridge
    ▼
Evaluation Intelligence
    │  IEvaluationLearningBridge
    ▼
Learning
    │  ILearningOptimizationBridge
    ▼
Execution Optimization
    │  IOptimizationExperienceBridge
    ▼
Experience Intelligence
    │  IExperienceRepositoryBridge
    ▼
Repository Updates
```
