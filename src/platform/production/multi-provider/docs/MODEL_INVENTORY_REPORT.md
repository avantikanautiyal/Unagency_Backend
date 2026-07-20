# Model Inventory Report

## Total

**45** bootstrap models across **34** providers.

## Shape

`ModelInventoryRow`:

- `providerId`, `modelId`, `modelLabel`
- `modalities` (from generator manifest)
- `discoverySource`
- `department` (llm, research, image, video, voice, music, audio, three_d)

## Resolution rule

Business callers use `resolveModel(DesiredCapabilityProfile)` — never GPT/Claude/Gemini
brand strings as targets. Model IDs are capability-resolved catalogs of the form
`providerId:slug-label`.
