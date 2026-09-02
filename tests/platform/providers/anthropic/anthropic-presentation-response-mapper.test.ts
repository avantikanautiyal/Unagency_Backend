/**
 * Anthropic normalized response shapes for PresentationRoutes expansion.
 */

import { mapAnthropicResponseToCanonical } from "../../../../src/platform/providers/anthropic/responses/response-mapper";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../../src/platform/os/delivery/document-export-service";
import { simulatedPresentationRoutesJson } from "../../../../src/platform/providers/runtime/testing";

const adapterRequest = {
  requestId: "req_anthropic_pres",
  providerId: "provider.anthropic" as never,
  adapterId: "anthropic" as never,
  modelId: "claude-sonnet-4-5",
  capabilityId: "text.generate" as never,
  modality: "text" as const,
  input: {},
  parameters: {},
  features: ["response_format"],
  streaming: false,
  timeoutMs: 120_000,
  metadata: {},
  createdAt: new Date().toISOString(),
};

describe("Anthropic presentation expansion response normalization", () => {
  it("prefers exportable tool_use input when routes are present", () => {
    const routes = JSON.parse(simulatedPresentationRoutesJson()) as Record<
      string,
      unknown
    >;
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          {
            type: "tool_use",
            name: "PresentationRoutes",
            input: routes,
          },
        ],
        stop_reason: "tool_use",
      },
      adapterRequest,
      100,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.structured))).not.toBeNull();
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.content))).not.toBeNull();
  });

  it("falls back to text JSON when tool_use input is empty but text has routes", () => {
    const routesJson = simulatedPresentationRoutesJson();
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          {
            type: "tool_use",
            name: "PresentationRoutes",
            input: {},
          },
          {
            type: "text",
            text: routesJson,
          },
        ],
        stop_reason: "tool_use",
      },
      adapterRequest,
      100,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.structured).toBeDefined();
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.structured))).not.toBeNull();
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.content))).not.toBeNull();
  });

  it("does not treat concepts-only tool input as structured routes", () => {
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          {
            type: "tool_use",
            name: "PresentationRouteConcepts",
            input: {
              concepts: [
                { title: "A", description: "d", narrativeAngle: "n" },
              ],
            },
          },
        ],
        stop_reason: "tool_use",
      },
      adapterRequest,
      100,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.structured).toBeUndefined();
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.content))).toBeNull();
  });
});
