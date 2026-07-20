# OpenAI Provider — Architecture Review

## Mission

Reference provider integration proving the Provider Platform works end-to-end:

Template concepts → SDK → Transport (leaf HTTP) → Runtime → Adapter → Integration
patterns → Certification.

## Model Resolution Flow

```mermaid
flowchart TD
  EI[Execution Intelligence]
  MI[Model Intelligence]
  NEG[Negotiation]
  RT[Routing]
  OA[OpenAI Provider]
  RES[Model Resolver]
  INV[Discovered Inventory Cache]
  API[OpenAI /v1/models]

  EI --> MI --> NEG --> RT --> OA
  OA --> RES
  RES --> INV
  API --> INV
  RES -->|Best OpenAI Model| OA
```

## Reference Pattern for Future Providers

| Seam | OpenAI Leaf |
|------|-------------|
| Manifest | `buildManifestFromDiscovery` |
| SDK Wrapper | `OpenAISdkClient` implements `IOpenAISdk` |
| Authentication | API key / org / project |
| Request Mapper | `mapCanonicalToOpenAIRequest` |
| Response Mapper | `mapOpenAIResponseToCanonical` |
| Model Resolver | `OpenAIModelResolver` (mandatory) |

## Design Rules

- No hardcoded Intelligence OS model targets (`gpt-4` / `gpt-5`)
- Inventory from discovery API (live or simulated HTTP)
- Capability enrichment inferred from discovered model ids
- Networking only inside `providers/openai/` leaf
- Frozen `sdk/openai` placeholder left unmodified
- Certification required before `active`

## Dependency Graph

```mermaid
flowchart TD
  OAI[providers/openai]
  ADP[adapters]
  SDK[sdk interfaces]
  RT[runtime]
  CERT[provider-certification]
  SH[shared]

  OAI --> ADP
  OAI --> SDK
  OAI --> RT
  OAI --> CERT
  OAI --> SH
  OAI -.->|does not modify| PLACEHOLDER[sdk/openai placeholder]
```
