# Capability Mapping Report

## Principle

Business modules request **capabilities**, never brand models.

```
Capability Profile → resolveModel() → Best available model → Execution
```

## Department → capability matrix (catalog → manifest)

| Department | Example capabilities |
|------------|----------------------|
| llm | `marketing.copywriting`, `software.code_generation`, `business.strategy` |
| research | `research.market_analysis` |
| image_generation | `design.image_generation`, `design.logo_creation` |
| video_generation | `video.short_form_generation`, `video.avatar_generation` |
| voice_generation | `audio.speech_generation` |
| music | `audio.music_generation` |
| audio | `audio.sfx_generation` |
| three_d | `design.3d_generation` |

Multi-department providers (e.g. OpenAI, Google, Higgsfield) merge feature flags and capability matrices.

## Registry merge

Registration merges `supportedProviders` / `supportedModels` onto existing taxonomy entries when capability IDs already exist.
