# Provider Certification Framework — Future Extension Report

## FE-PCF1 — Automated Nightly Certification

Schedule certification runs against registered adapters. Requires persistent certification
history store — not implemented in v1.0.

## FE-PCF2 — Regression Certification

Re-run certification on adapter version bumps. Compare scorecards across versions.
Extension point: `CertificationMode.regression`.

## FE-PCF3 — Version Certification

Certify specific manifest versions independently. Wire `ProviderManifestVersion` pinning.

## FE-PCF4 — Model-Level Certification

Per-model certification within a provider manifest. Extend suites to iterate all models.

## FE-PCF5 — SDK Upgrade Certification

When SDK wrapper interfaces change, re-certify all adapters using that SDK version.

## FE-PCF6 — Live Provider Sandbox

Optional sandbox environment with real providers — strictly opt-in, separate from
certification framework which remains mock-only.

## FE-PCF7 — Routing Gate Integration

Block uncertified providers in `IProviderRoutingEngine` based on badge status.

## Non-Goals (This Milestone)

- Real provider execution
- HTTP/gRPC endpoints
- Vendor SDK integration
- Frozen module modifications
