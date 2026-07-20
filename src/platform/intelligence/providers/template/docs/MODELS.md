# M5.1.1 Provider Template — Models & Diagrams

## Provider Lifecycle Diagram

```
uninitialized → initializing → authenticating → validating
  → health_checking → loading_models → ready
  → executing / streaming → shutting_down → shutdown
```

## Request Mapping Diagram

```
TemplateCanonicalRequest
  → AbstractRequestMapper.toWireRequest()
  → TemplateWirePayload
  → AbstractProviderSdk.invoke()
  → TemplateWirePayload (response)
  → AbstractResponseMapper.toCanonicalResponse()
  → TemplateCanonicalResponse
```

## Streaming Architecture

```
openSession → processChunk (start|chunk|heartbeat|end|error) → closeSession
```

## Error Mapping Architecture

```
raw error → IProviderErrorMapper → TemplateProviderError
  → TEMPLATE_TO_CANONICAL_ERROR → CanonicalErrorKind
```

## Dependency Graph

```
TemplateProviderEngine
  → Health, Diagnostics, ModelMapper (registry contracts)
  → AbstractProviderFactory → Adapter → SDK → Mappers
  ⇏ Frozen Runtime / Transport / SDK implementations
```

## Feature Matrix

18 `TemplateFeatureKind` values — every provider exposes identical matrix shape.
