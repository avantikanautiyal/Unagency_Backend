/**
 * Simulated image HTTP client — deterministic offline responses.
 */

import { success, type Result } from "../../../core/result";
import type { IImageHttpClient, ImageHttpRequest, ImageHttpResponse } from "./image-http-client";

export class SimulatedImageHttpClient implements IImageHttpClient {
  constructor(
    private readonly vendor: string,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: ImageHttpRequest): Promise<Result<ImageHttpResponse>> {
    const start = this.clockMs();
    const prompt =
      typeof request.body?.prompt === "string" ? request.body.prompt : "simulated";

    if (this.vendor === "blackforestlabs" && request.method === "POST") {
      return success({
        status: 200,
        headers: { "content-type": "application/json" },
        body: { id: `sim-bfl-${this.clockMs()}` },
        latencyMs: this.clockMs() - start,
      });
    }

    if (this.vendor === "blackforestlabs" && request.method === "GET") {
      return success({
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          status: "Ready",
          result: {
            sample: `https://simulated.unagency.local/${this.vendor}/${encodeURIComponent(prompt)}.png`,
          },
        },
        latencyMs: this.clockMs() - start,
      });
    }

    if (this.vendor === "google") {
      const tinyPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      return success({
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: tinyPng,
                    },
                  },
                ],
              },
            },
          ],
        },
        latencyMs: this.clockMs() - start,
      });
    }

    return success({
      status: 200,
      headers: { "content-type": "application/json" },
      body: {
        data: [
          {
            url: `https://simulated.unagency.local/${this.vendor}/${encodeURIComponent(prompt)}.png`,
          },
        ],
        images: [
          {
            url: `https://simulated.unagency.local/${this.vendor}/${encodeURIComponent(prompt)}.png`,
          },
        ],
      },
      latencyMs: this.clockMs() - start,
    });
  }
}
