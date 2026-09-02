/**
 * Deterministic fake tools for offline M9.5L certification.
 */

import type { InMemoryToolRegistry } from "../registry/in-memory-tool-registry";

export interface FakeToolState {
  updateTestRecordCalls: number;
  lastUpdate?: Readonly<Record<string, unknown>>;
  seenInvocationKeys?: Set<string>;
}

export function registerFakeCertificationTools(
  registry: InMemoryToolRegistry,
  state: FakeToolState = { updateTestRecordCalls: 0 }
): FakeToolState {
  registry.register(
    {
      name: "lookup_campaign",
      description: "Read-only campaign lookup",
      riskClass: "read_only",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["campaignId"],
        properties: {
          campaignId: { type: "string" },
        },
      },
    },
    (input) => ({
      campaignId: input.arguments.campaignId,
      name: "Winter Launch",
      status: "active",
      organizationId: input.organizationId,
    })
  );

  registry.register(
    {
      name: "calculate_metric",
      description: "Deterministic metric calculation",
      riskClass: "read_only",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "value"],
        properties: {
          metric: { type: "string" },
          value: { type: "number" },
        },
      },
    },
    (input) => ({
      metric: input.arguments.metric,
      result: Number(input.arguments.value) * 2,
    })
  );

  registry.register(
    {
      name: "update_test_record",
      description: "Controlled side-effect write for idempotency tests",
      riskClass: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["recordId", "status"],
        properties: {
          recordId: { type: "string" },
          status: { type: "string" },
        },
      },
    },
    (input) => {
      const seen = state.seenInvocationKeys ?? (state.seenInvocationKeys = new Set<string>());
      if (seen.has(input.invocationKey)) {
        return { ok: true, ...(state.lastUpdate ?? {}) };
      }
      seen.add(input.invocationKey);
      state.updateTestRecordCalls += 1;
      state.lastUpdate = {
        recordId: input.arguments.recordId,
        status: input.arguments.status,
        invocationKey: input.invocationKey,
        calls: state.updateTestRecordCalls,
      };
      return { ok: true, ...state.lastUpdate };
    }
  );

  registry.register(
    {
      name: "failing_tool",
      description: "Always fails",
      riskClass: "read_only",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    async () => {
      throw new Error("controlled tool failure");
    }
  );

  registry.register(
    {
      name: "slow_tool",
      description: "Exceeds timeout",
      riskClass: "read_only",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    async () => {
      await new Promise((r) => setTimeout(r, 300));
      return { ok: true };
    }
  );

  registry.register(
    {
      name: "denied_tool",
      description: "Present in registry but denied by policy name list",
      riskClass: "read_only",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    () => ({ shouldNeverRun: true })
  );

  return state;
}
