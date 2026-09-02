/**
 * M9.5O — Assemble final output from stream events (bounded).
 */

import type { ProviderStreamEvent } from "../contracts/provider-stream-event";
import type { NormalizedUsage } from "../../../cost/contracts/normalized-usage";
import type { StreamUsageStatus } from "../contracts/provider-stream-event";

export interface AssembledToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentsJson: string;
}

export interface AssembledStreamOutput {
  readonly content: string;
  readonly reasoning: string;
  readonly toolCalls: readonly AssembledToolCall[];
  readonly audioByteLength: number;
  readonly usage: NormalizedUsage | null;
  readonly usageStatus: StreamUsageStatus;
  readonly finishReason?: string;
  readonly partial: boolean;
}

export class StreamOutputAssembler {
  private content = "";
  private reasoning = "";
  private readonly tools = new Map<
    string,
    { name: string; args: string }
  >();
  private audioByteLength = 0;
  private usage: NormalizedUsage | null = null;
  private usageStatus: StreamUsageStatus = "unknown";
  private finishReason?: string;
  private completed = false;
  private failed = false;

  ingest(event: ProviderStreamEvent): void {
    if (event.contentDelta) this.content += event.contentDelta;
    if (event.reasoningDelta) this.reasoning += event.reasoningDelta;
    if (event.audio?.byteLength) this.audioByteLength += event.audio.byteLength;

    if (event.toolCall) {
      const existing = this.tools.get(event.toolCall.id) ?? {
        name: event.toolCall.name ?? "",
        args: "",
      };
      if (event.toolCall.name) existing.name = event.toolCall.name;
      if (event.toolCall.argumentsDelta) {
        existing.args += event.toolCall.argumentsDelta;
      }
      this.tools.set(event.toolCall.id, existing);
    }

    if (event.type === "usage.delta" && event.usage) {
      this.usage = event.usage;
      this.usageStatus = "partial";
    }
    if (event.type === "usage.final") {
      this.usage = event.usage ?? this.usage;
      this.usageStatus = event.usage ? "final" : "unknown";
    }
    if (event.finishReason) this.finishReason = event.finishReason;
    if (event.type === "stream.completed") this.completed = true;
    if (event.type === "stream.failed" || event.type === "stream.cancelled") {
      this.failed = true;
    }
  }

  snapshot(): AssembledStreamOutput {
    return {
      content: this.content,
      reasoning: this.reasoning,
      toolCalls: [...this.tools.entries()].map(([id, t]) => ({
        id,
        name: t.name,
        argumentsJson: t.args,
      })),
      audioByteLength: this.audioByteLength,
      usage: this.usage,
      usageStatus: this.usageStatus,
      finishReason: this.finishReason,
      partial: !this.completed || this.failed,
    };
  }

  /** Validate assembled tool JSON arguments — fail closed on malformed. */
  validateToolArguments(): { ok: true } | { ok: false; toolId: string; reason: string } {
    for (const [id, t] of this.tools) {
      if (!t.name) return { ok: false, toolId: id, reason: "missing_tool_name" };
      try {
        JSON.parse(t.args || "{}");
      } catch {
        return { ok: false, toolId: id, reason: "malformed_tool_arguments" };
      }
    }
    return { ok: true };
  }
}
