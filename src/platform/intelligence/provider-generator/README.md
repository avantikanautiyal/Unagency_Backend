# Universal Provider Generator & Integration Factory

The **only** supported mechanism for integrating AI providers into UNAGENCY.

OpenAI is the reference leaf. Every future provider is **generated** from the
same canonical template — no provider-specific architectures.

## Pipeline

```
Provider Manifest
  + Auth Schema
  + Discovery Endpoint
  + Capability Mapping
        ↓
 Provider Generator Engine
        ↓
 Complete Provider Package (files)
```

## Usage

```typescript
import {
  createProviderGeneratorPlatform,
} from "./index";
import { sampleGenerationRequest } from "./testing";

const { engine } = createProviderGeneratorPlatform();
const report = await engine.generate(sampleGenerationRequest());

if (report.ok) {
  console.log(report.value.package.files.map((f) => f.relativePath));
  console.log(report.value.package.integrationChecklist);
}
```

## Rules

- Never hardcode model names — generated leaves call \`discoverModels()\`
- Business modules request capabilities, never \`gpt-*\` / vendor brands
- Generator does **not** modify frozen modules
- This milestone does **not** emit Anthropic/Gemini/etc. production leaves

See \`docs/\` for architecture and ACP.
