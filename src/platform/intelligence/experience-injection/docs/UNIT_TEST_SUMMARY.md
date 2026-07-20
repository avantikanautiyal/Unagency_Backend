# Unit Test Summary — Experience Injection

## Suite

`tests/platform/intelligence/experience-injection/engine.test.ts`

## Tests (7)

| Test | Assertion |
|------|-----------|
| top relevant from large repo | ≤10 experiences from 500+ candidates |
| conflict resolution | opposing tones → ≤1 winner |
| packaging categories | advisory corrections + explainability |
| relevance ranking | scores present, ranks ascending |
| Experience Intelligence repo | inject against live EI repository |
| no prompt / no AI | containsPromptContent false |
| seed scale | makeSeedExperiences(1000) length 1000 |

## Run

```bash
npx jest tests/platform/intelligence/experience-injection
npx jest tests/platform/intelligence
```
