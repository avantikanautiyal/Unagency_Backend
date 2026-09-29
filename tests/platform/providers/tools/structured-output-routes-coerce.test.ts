/**
 * Regression: CDF text_choice `{ routes }` schemas must not be coerced as
 * PresentationRoutes (which drops slide-less cards → empty routes array).
 */

import assert from "node:assert/strict";
import { coerceValueTowardJsonSchema } from "../../../../src/platform/providers/tools/structured/structured-output-coerce";
import { SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA } from "../../../../src/platform/os/delivery/cdf-text-choice-schemas";
import { PRESENTATION_ROUTES_STRUCTURED_SCHEMA } from "../../../../src/platform/os/delivery/presentation-schemas";
import { parseOrRecoverStructuredOutput } from "../../../../src/platform/providers/tools/structured/structured-output-execution";

const smRoutesPayload = {
  routes: [
    {
      name: "A",
      creativeIdea: "idea a",
      visualTreatment: "vis a",
      headlineAngle: "head a",
      rationale: "why a",
    },
    {
      name: "B",
      creativeIdea: "idea b",
      visualTreatment: "vis b",
      headlineAngle: "head b",
      rationale: "why b",
    },
    {
      name: "C",
      creativeIdea: "idea c",
      visualTreatment: "vis c",
      headlineAngle: "head c",
      rationale: "why c",
    },
  ],
};

describe("structured-output coerce — routes schemas", () => {
  it("does not empty CdfSocialMediaRoutes via PresentationRoutes coerce", () => {
    const coerced = coerceValueTowardJsonSchema(
      smRoutesPayload,
      SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
      "CdfSocialMediaRoutes",
    ) as { routes?: unknown[] };
    assert.equal(Array.isArray(coerced.routes), true);
    assert.equal(coerced.routes!.length, 3);
    assert.equal((coerced.routes![0] as { name?: string }).name, "A");
  });

  it("parseOrRecover accepts CdfSocialMediaRoutes structured JSON", () => {
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify(smRoutesPayload),
      {
        name: "CdfSocialMediaRoutes",
        schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        strict: true,
      },
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(
        Array.isArray((parsed.value as { routes: unknown[] }).routes),
        true,
      );
      assert.equal(
        (parsed.value as { routes: unknown[] }).routes.length,
        3,
      );
    }
  });

  it("strips undeclared properties (routeId/title) before strict validation", () => {
    const withExtras = {
      routes: smRoutesPayload.routes.map((r, i) => ({
        ...r,
        routeId: `route_0${i + 1}`,
        title: r.name,
      })),
    };
    const parsed = parseOrRecoverStructuredOutput(JSON.stringify(withExtras), {
      name: "CdfSocialMediaRoutes",
      schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      strict: true,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      const first = (parsed.value as { routes: Record<string, unknown>[] })
        .routes[0]!;
      assert.equal(first.routeId, undefined);
      assert.equal(first.title, undefined);
      assert.equal(first.name, "A");
    }
  });

  it("remaps near-miss aliases toward declared schema properties", () => {
    const nearMiss = {
      routes: [
        {
          title: "A",
          idea: "idea a",
          visual: "vis a",
          headline: "head a",
          why: "why a",
        },
        {
          title: "B",
          idea: "idea b",
          visual: "vis b",
          headline: "head b",
          why: "why b",
        },
        {
          title: "C",
          idea: "idea c",
          visual: "vis c",
          headline: "head c",
          why: "why c",
        },
      ],
    };
    const parsed = parseOrRecoverStructuredOutput(JSON.stringify(nearMiss), {
      name: "CdfSocialMediaRoutes",
      schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      strict: true,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      const first = (parsed.value as { routes: Record<string, unknown>[] })
        .routes[0]!;
      assert.equal(first.name, "A");
      assert.equal(first.creativeIdea, "idea a");
      assert.equal(first.visualTreatment, "vis a");
      assert.equal(first.headlineAngle, "head a");
      assert.equal(first.rationale, "why a");
    }
  });

  it("malformed structured (wrong cardinality) still fails validation", () => {
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify({ routes: [smRoutesPayload.routes[0]] }),
      {
        name: "CdfSocialMediaRoutes",
        schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        strict: true,
      },
    );
    assert.equal(parsed.ok, false);
  });

  it("still coerces PresentationRoutes deck shapes", () => {
    const nearMiss = {
      routes: [
        {
          name: "Deck A",
          description: "Story A",
          slides: [
            {
              title: "T1",
              bullets: ["one", "two"],
              notes: "",
              layout: "content_bullets",
              visualCue: "wash",
            },
            {
              title: "T2",
              bullets: ["three", "four"],
              notes: "",
              layout: "key_message",
              visualCue: "accent",
            },
          ],
        },
      ],
    };
    const coerced = coerceValueTowardJsonSchema(
      nearMiss,
      PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
      "PresentationRoutes",
    ) as { routes?: Array<{ title?: string; slides?: unknown[] }> };
    assert.ok(coerced.routes && coerced.routes.length >= 1);
    assert.ok((coerced.routes[0]!.slides?.length ?? 0) >= 2);
    assert.equal(coerced.routes[0]!.title, "Deck A");
  });
});
