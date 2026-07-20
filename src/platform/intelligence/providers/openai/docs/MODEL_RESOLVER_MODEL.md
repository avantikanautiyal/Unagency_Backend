# OpenAI Model Resolver Model

## Input

`DesiredCapabilityProfile` — modality, streaming, tools, vision, audio, embeddings,
reasoning, structured output, min context, cost preference.

## Process

1. Filter discovered inventory by required capabilities and lifecycle
2. Score remaining models (capability fit, context, cost preference)
3. Return `OpenAIModelResolution` with selected id, candidates, rationale

## Output

Never returns a statically preferred Intelligence OS name. Selection is entirely
from the current discovered OpenAI inventory.

## Location

`models/model-resolver.ts`
