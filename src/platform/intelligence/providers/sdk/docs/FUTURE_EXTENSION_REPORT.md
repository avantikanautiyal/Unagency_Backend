# M4.6 SDK Platform — Future Extension Report

## 1. Integrating a real provider (example: OpenAI)

Only `OpenAISdkWrapper` changes:

1. Add `openai` package as a **leaf dependency** (not imported by any other platform module).
2. Implement `execute()`:
   - Build a `CanonicalProviderRequest` from `SdkRequest`.
   - Call `IProviderTransportEngine.execute()` (M4.5) or invoke the SDK and normalize.
   - Map the opaque response into `SdkResponse`.
3. Implement `stream()` using `ISdkStreamingEngine` to normalize chunks.
4. Implement `authenticate()` using `ISdkAuthenticationProvider` + M4.2 Identity.

No changes to negotiation, adapter framework, runtime, gateway, or any M1–M3 module.

## 2. Transport bridge

Future wrappers inject `IProviderTransportEngine` and translate:

```
SdkRequest → CanonicalProviderRequest → transport.execute() → SdkResponse
```

This keeps HTTP/SDK/gRPC details inside Transport (M4.5) while SDK wrappers
remain the vendor-specific translation layer.

## 3. Real authentication

Replace `PlaceholderSdkAuthenticationProvider` with implementations that:
- Resolve `credentialRef` via M4.2 `ISecretProvider` (never expose secrets).
- Support OAuth token refresh for vendors that require it.
- Apply real `Authorization` headers inside the wrapper (not in shared modules).

## 4. SDK package detection

`ISdkDiagnostics.dependencyReport()` can be extended to detect installed packages
via optional peer-dependency checks — without importing them at the platform level.

## 5. Streaming entry point

Add `IProviderSdkEngine.executeStream()` returning
`AsyncIterable<SdkStreamingChunk>` when the first streaming wrapper is implemented.

## 6. Model catalog sync

`SdkModelDescriptor` lists in each wrapper's `describe()` can be populated from
`ProviderManifest` (M4.4) to avoid duplicate model metadata.

## 7. What will never need to change

- `SdkRequest` / `SdkResponse` (the adapter-to-SDK boundary).
- `IProviderSdkEngine` (the single public entry point).
- Specialized vendor interfaces (`IOpenAISdk`, etc.).
- Any frozen M1–M4.5 module.
