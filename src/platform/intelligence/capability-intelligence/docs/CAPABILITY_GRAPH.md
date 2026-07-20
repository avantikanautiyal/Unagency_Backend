# Capability Graph

## Nodes

`CapabilityGraphNode`: nodeId, capabilityId, stage, optional

## Edges

`depends_on` | `feeds` | `optional`

## Shapes

| Shape | Inference |
|-------|-----------|
| single | ≤1 capability |
| chain | linear fan-in/out ≤1 |
| tree | fan-out >1, fan-in ≤1 |
| dag | fan-in >1 |
| pipeline | sequential multi-stage |
| bundle | multiple independent |

## Topological order

Kahn-style sort over declared dependencies; cycle leftovers appended.

Produced by `DefaultCapabilityComposer`.
