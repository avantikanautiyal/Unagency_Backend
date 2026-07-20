# Unit Test Summary

## Suite

`tests/platform/intelligence/provider-catalog/catalog-integration.test.ts`

| Test | Intent |
|------|--------|
| Full catalog via generator | All seed providers; discovery; mesh; capabilities |
| OpenAI leaf preservation | `existingLeaf` + still generated |
| No invented providers | Seed integrity |
| Manifest mapping | Valid capability-first manifests |
| Capability resolve | Brand-agnostic `resolveModel` |
| Cert failure path | Incomplete package not certified |
| Mesh registration | Health observe per provider |

## Coverage areas requested

- Authentication schemas (via generated manifests / auth artifacts)
- Discovery (`discoverModels` bootstrap/cache)
- Model resolver (capability profile)
- Capability mapping
- Certification gate
- Runtime / mesh registration ledgers
- Integration (end-to-end catalog engine)
