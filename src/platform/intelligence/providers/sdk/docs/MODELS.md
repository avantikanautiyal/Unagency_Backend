# M4.6 SDK Platform — Models & Diagrams

## 1. SDK Architecture Diagram

```
SdkRequest
    │
    ▼
ProviderSdkEngine ── publishes ──▶ ISdkEventPublisher (Noop | EventBus)
    │
    ├── ISdkRegistry.resolve(vendor)
    ├── ISdkAuthenticationProvider.validate()
    ├── ISdkRetryEngine.execute()
    ├── ISdkTimeoutEngine.run()
    └── IProviderSdkClient.execute() / stream()
            │
            ▼
    SdkExecutionResult (+ SdkResponse or SdkError)
```

## 2. SDK Registry Diagram

```
InMemorySdkRegistry
  register(client)  → byVendor[vendor] = client
                      byId[clientId]    = client
  resolve(vendor)   → IProviderSdkClient
  resolveById(id)   → IProviderSdkClient
  remove(vendor)    → delete from both maps
  list()            → SdkVendor[]
  describe(vendor)  → SdkClientDescriptor
  validate(client)  → SdkValidationResult
```

## 3. SDK Execution Pipeline

```
execute(request)
  1. Validate request shape
  2. Validate authentication (if present)
  3. Resolve SDK wrapper from registry
  4. Create SdkExecutionContext (executionId, clientId)
  5. RetryEngine → TimeoutEngine → client.execute()
  6. Record health + diagnostics
  7. Normalize → SdkExecutionResult
  8. Publish event (optional)
```

## 4. SDK Authentication Model

```
ISdkAuthenticationProvider
  validate(auth)     → api_key requires credentialRef; no secrets
  applyHeaders(auth) → { "x-auth-kind": "api_key" | "bearer" | … }
  refresh(auth)      → updated SdkAuthentication metadata (placeholder)

SdkAuthentication kinds:
  api_key | bearer | oauth | service_account | token_refresh
```

No real OAuth flows. Credential refs point to M4.2 Identity platform (future).

## 5. SDK Streaming Model

```
ISdkStreamingEngine
  normalizeChunk(raw, context, seq) → SdkStreamingChunk{kind: chunk|complete}
  partial(raw, context, seq)        → {kind: partial}
  complete(context, seq)            → {kind: complete, done: true}
  error(message, context, seq)      → {kind: error, done: true}
```

Event kinds: `start | chunk | partial | complete | error | heartbeat`.

## 6. SDK Diagnostics Model

```
ISdkDiagnostics
  registrationReport()   → per-vendor registered + version
  configurationReport()  → configured + auth present + reasons
  compatibilityReport()  → capability vs FeatureRequirement
  dependencyReport()     → sdkPackageInstalled (false), transportAvailable
  versionReport()        → wrapper version + future sdk package version
  recordExecution()      → latency/failure samples
```

## 7. SDK Health Model

```
DefaultSdkHealthMonitor
  markRegistered(vendor, bool)
  markConfigured(vendor, bool)
  record(vendor, ok, latencyMs?)
  vendorHealth(vendor):
    unregistered     → unconfigured
    failRatio < 0.2  → healthy
    failRatio < 0.5  → degraded
    otherwise        → unhealthy
```

## 8. Dependency Graph (module level)

```
contracts ← interfaces ← common/abstract-sdk-client
                ↑
    openai/ anthropic/ gemini/ … xai/  (wrappers)
                ↑
         registry + engine + subsystems
                ↑
           factories + testing
```
