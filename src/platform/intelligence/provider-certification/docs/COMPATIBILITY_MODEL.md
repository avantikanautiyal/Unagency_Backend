# Compatibility Model

## ProviderCompatibilityProfile

Derived from `ProviderManifest`:

```typescript
interface ProviderCompatibilityProfile {
  readonly providerId: string;
  readonly vendor: string;
  readonly compatible: boolean;
  readonly supportedModalities: readonly string[];
  readonly supportedFeatures: readonly string[];
  readonly supportedRegions: readonly string[];
  readonly authenticationTypes: readonly string[];
  readonly manifestVersion: string;
}
```

## Assessment

- `compatible` = manifest status is `ready` or `registered`
- Features extracted from manifest feature flags
- Used by Routing/Negotiation gate (future)

## Location

`contracts/profile.ts`
