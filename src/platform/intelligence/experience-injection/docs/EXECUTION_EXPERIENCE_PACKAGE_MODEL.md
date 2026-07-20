# Execution Experience Package Model

## ExecutionExperiencePackage

Immutable package with:

- `relevantExperiences` — ranked PackagedExperience[]
- `corrections`, `bestPractices`, `warnings`, `antiPatterns`, `optimizationSuggestions`
- `applicability`, `confidence`, `evidenceReferences`
- `conflicts`, `explainability`
- `advisoryOnly: true`
- `containsPromptContent: false`

## Invariants

1. Never contains raw prompts or prompt fragments
2. Never edits prompts
3. All corrections are advisory only
4. Top N / max context enforced by compressor

## Location

`contracts/package.ts`, `packaging/experience-packager.ts`
