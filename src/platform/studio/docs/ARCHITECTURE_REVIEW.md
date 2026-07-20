# Studio Engine — Architecture Review

## Verdict

Framework-agnostic **product interaction engine** at `src/platform/studio/`.
Defines how users work. Frontends only render contracts. Backend platforms remain
frozen and are never called directly.

## Boundary

```
React Native / Web / Desktop (future renderers)
                ↓ consume contracts
         Studio Engine (this module)
                ↓ StudioGatewayRequest only
         Enterprise API Gateway
                ↓
         Frozen backend platforms
```

## Non-goals

- React / React Native / HTML / CSS
- Intelligence OS / Brand Brain / Knowledge Intelligence redesign
- Direct provider, runtime, routing, business, or persistence calls
- Visual design systems
