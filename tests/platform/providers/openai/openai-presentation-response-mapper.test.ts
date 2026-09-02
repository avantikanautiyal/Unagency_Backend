/**
 * OpenAI normalized response shapes for PresentationRoutes expansion.
 */

import { mapOpenAIResponseToCanonical } from "../../../../src/platform/providers/openai/responses/response-mapper";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../../src/platform/os/delivery/document-export-service";
import { simulatedPresentationRoutesJson } from "../../../../src/platform/providers/runtime/testing";

const adapterRequest = {
  requestId: "req_openai_pres",
  providerId: "provider.openai" as never,
  adapterId: "openai" as never,
  modelId: "gpt-4o",
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

describe("OpenAI presentation expansion response normalization", () => {
  it("maps json_schema string content to exportable routes", () => {
    const routesJson = simulatedPresentationRoutesJson();
    const mapped = mapOpenAIResponseToCanonical(
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: routesJson },
          },
        ],
      },
      adapterRequest,
      100,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.content))).not.toBeNull();
  });

  it("maps message.parsed object when content is empty", () => {
    const routes = JSON.parse(simulatedPresentationRoutesJson()) as Record<
      string,
      unknown
    >;
    const mapped = mapOpenAIResponseToCanonical(
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "", parsed: routes },
          },
        ],
      },
      adapterRequest,
      100,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.structured).toEqual(routes);
    expect(typeof out.content).toBe("string");
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.structured))).not.toBeNull();
  });

  it("preserves refusal without fabricating routes", () => {
    const mapped = mapOpenAIResponseToCanonical(
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: null,
              refusal: "I cannot comply",
            },
          },
        ],
      },
      adapterRequest,
      100,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.refusal).toBe("I cannot comply");
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(out.content))).toBeNull();
  });
});
