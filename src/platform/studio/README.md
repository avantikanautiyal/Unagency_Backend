# UNAGENCY Studio Engine

Product interaction layer that powers every future UNAGENCY application.

**This is not UI.** React Native, Web, and Desktop only *render* the Studio.

## Guarantees

| Rule | Enforcement |
|------|-------------|
| No React / RN / HTML / CSS | Contracts + engine only |
| Immutable state | `StudioState` revisions |
| Gateway-only integration | `StudioGatewayRequest.channel = enterprise_api_gateway` |
| No OS / provider / runtime calls | Path assertions in tests |
| Studio types are configurations | `STUDIO_TYPE_CONFIGS` over one engine |

## Quick start

```ts
import {
  createStudioPlatform,
  StudioWorkspaceBuilder,
} from "./studio";

const { engine } = createStudioPlatform({ organizationId: "org_1" });

engine.dispatch(
  StudioWorkspaceBuilder.create()
    .forOrganization("org_1")
    .named("Launch Hub")
    .withStudioType("marketing")
    .build()
);

const state = engine.getState(); // immutable snapshot for any renderer
```

## Integration

AI work goes out as Gateway envelopes:

```ts
engine.buildExecutionGatewayRequest({
  organizationId: "org_1",
  accessTokenRef: "token_ref",
  prompt: "...",
  sessionId: "session_1",
});
```

## Stop gate

Studio Engine complete. Do not begin UI implementation in this milestone.
