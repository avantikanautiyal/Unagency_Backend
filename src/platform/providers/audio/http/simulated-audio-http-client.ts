/**
 * Simulated vendor audio HTTP — zero network for offline certification.
 */

import { success, type Result } from "../../../core/result";
import type { IAudioHttpClient, AudioHttpRequest, AudioHttpResponse } from "./audio-http-client";

export class SimulatedAudioHttpClient implements IAudioHttpClient {
  constructor(
    private readonly vendor: string,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: AudioHttpRequest): Promise<Result<AudioHttpResponse>> {
    const start = this.clockMs();
    const text =
      typeof request.body?.text === "string"
        ? request.body.text
        : typeof request.body?.transcript === "string"
          ? request.body.transcript
          : typeof request.body?.input === "string"
            ? request.body.input
            : "simulated";

    return success({
      status: 200,
      headers: { "content-type": "audio/mpeg" },
      body: {
        _contentType: "audio/mpeg",
        _audioUrl: `https://example.local/simulated/${this.vendor}/tts.mp3`,
        _inputCharacters: text.length,
        simulated: true,
        vendor: this.vendor,
      },
      latencyMs: this.clockMs() - start,
    });
  }
}
