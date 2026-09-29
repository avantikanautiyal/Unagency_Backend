/**
 * Generic creative-direction production-semantics contract coverage.
 */

import {
  FULL_VISUAL_PRODUCTION_SEMANTICS,
  buildCreativeDirectionRoutesSchema,
  productionFieldKeysForSemantics,
  creativeDirectionProductionSchemaProperties,
} from "../../../src/platform/cdf/creative-direction/production-semantics";
import {
  CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
  GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA,
  SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA,
  PACKAGING_ROUTES_STRUCTURED_SCHEMA,
} from "../../../src/platform/os/delivery/cdf-text-choice-schemas";
import { resolveStructuredOutputSchemaByContractName } from "../../../src/platform/cdf/structured-output-contract";
import { assessCreativeDirectionCompleteness } from "../../../src/platform/cdf/generation-context/creative-direction-completeness";

describe("production-semantics capability contract", () => {
  it("derives field keys from capabilities without service branches", () => {
    const keys = productionFieldKeysForSemantics({
      communication: true,
      brand: true,
    });
    expect(keys).toEqual(
      expect.arrayContaining([
        "communicationObjective",
        "primaryMessage",
        "brandIntegration",
        "identityMarkRole",
      ]),
    );
    expect(keys).not.toContain("composition");
  });

  it("builds schemas with capability-gated production props", () => {
    const schema = buildCreativeDirectionRoutesSchema({
      requiredConceptFields: ["name", "creativeIdea"],
      productionSemantics: { communication: true, constraints: true },
    }) as {
      properties: {
        routes: { items: { properties: Record<string, unknown> } };
      };
    };
    const props = schema.properties.routes.items.properties;
    expect(props.communicationObjective).toEqual({ type: "string" });
    expect(props.avoidances).toEqual({ type: "string" });
    expect(props.composition).toBeUndefined();
  });

  it("registers CdfCreativeDirections alongside social/packaging", () => {
    expect(
      resolveStructuredOutputSchemaByContractName(
        CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      )?.name,
    ).toBe(CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME);
    const socialProps = (
      SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as {
        properties: {
          routes: { items: { properties: Record<string, unknown> } };
        };
      }
    ).properties.routes.items.properties;
    const packProps = (
      PACKAGING_ROUTES_STRUCTURED_SCHEMA as {
        properties: {
          routes: { items: { properties: Record<string, unknown> } };
        };
      }
    ).properties.routes.items.properties;
    const genericProps = (
      GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA as {
        properties: {
          routes: { items: { properties: Record<string, unknown> } };
        };
      }
    ).properties.routes.items.properties;
    for (const key of productionFieldKeysForSemantics(
      FULL_VISUAL_PRODUCTION_SEMANTICS,
    )) {
      expect(socialProps[key]).toEqual({ type: "string" });
      expect(packProps[key]).toEqual({ type: "string" });
      expect(genericProps[key]).toEqual({ type: "string" });
    }
  });

  it("completeness scopes production grading to declared capabilities", () => {
    const choice = {
      name: "Territory One",
      creativeIdea:
        "A clear brand promise that speaks to parents seeking trustworthy learning partners for growing children.",
      rationale:
        "Promise-led messaging builds recognition without requiring a finished visual composition yet.",
      communicationObjective:
        "Introduce the brand promise as a trustworthy partner for children’s growth.",
      primaryMessage:
        "We nurture every child’s potential from the first classroom onward.",
    };
    const copyOnly = assessCreativeDirectionCompleteness(choice, {
      productionSemantics: {
        communication: true,
        audience: true,
        context: true,
        constraints: true,
      },
    });
    expect(copyOnly.actionableProductionFieldCount).toBeGreaterThanOrEqual(1);
    // composition not in capability set — not required for complete/partial grade here
    expect(
      copyOnly.fields.find((f) => f.field === "composition"),
    ).toBeUndefined();
  });

  it("creativeDirectionProductionSchemaProperties respects capabilities", () => {
    const props = creativeDirectionProductionSchemaProperties({
      visual: true,
    });
    expect(props.composition).toEqual({ type: "string" });
    expect(props.primaryMessage).toBeUndefined();
  });
});
