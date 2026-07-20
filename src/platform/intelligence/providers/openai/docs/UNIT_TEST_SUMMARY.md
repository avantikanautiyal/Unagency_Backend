# Unit Test Summary — OpenAI Provider

## Suite

`tests/platform/intelligence/providers/openai/openai-provider.test.ts`

## Tests (8)

| Test | Assertion |
|------|-----------|
| discover + cache | force refresh then cache hit |
| resolve without gpt-4/5 | capability profile → selected model |
| dispatcher artifacts | execution + experience + metrics |
| certification gate | certified → active else experimental |
| no modelId required | resolver picks model |
| manifest from discovery | models present |
| embeddings profile | embedding model selected |
| runtime execute | success through injected dispatcher |

## Run

```bash
npx jest tests/platform/intelligence/providers/openai
```
