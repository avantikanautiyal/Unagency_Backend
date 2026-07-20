# Unit Test Summary — Experience Intelligence

## Suite

`tests/platform/intelligence/experience-intelligence/engine.test.ts`

## Tests (7)

| Test | Assertion |
|------|-----------|
| produces reusable experiences | experiences, root causes, corrections, applicability, snapshot |
| extracts root causes and corrections | advisoryOnly corrections, explanations |
| scores confidence and validates | scores, lifecycle draft/validated |
| repository search | search by category, count > 0 |
| produces snapshot | experienceCount, version |
| large historical batch | 1000 inputs, no AI/networking |
| never modifies prompts/models | all corrections advisoryOnly |

## Run

```bash
npx jest tests/platform/intelligence/experience-intelligence
```
