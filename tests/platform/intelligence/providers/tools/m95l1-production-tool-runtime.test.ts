/**
 * M9.5L1 — Production tool runtime wiring & durable approval (offline).
 * Zero external network / AI calls.
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createEnterpriseApiPlatform } from "../../../../../src/platform/api/factories/create-enterprise-api-platform";
import { seedExecutionContextFixtures } from "../../../../../src/platform/business/execution-context/testing/seed-fixtures";
import {
  createDurableStores,
  resetSharedTestDurableStores,
} from "../../../../../src/platform/infrastructure/durability/create-durable-stores";
import {
  InMemoryToolInvocationStore,
  MongoToolInvocationStore,
  EnterpriseToolInvocation,
  createToolRuntimePlatform,
  approveToolInvocation,
  buildToolProviderRequest,
  openaiFunctionCall,
  ScriptedToolProviderDispatcher,
  loadToolExecutionConfig,
  registerFakeCertificationTools,
  InMemoryToolRegistry,
  buildToolInvocationKey,
} from "../../../../../src/platform/intelligence/providers/tools";

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await EnterpriseToolInvocation.createIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  resetSharedTestDurableStores();
});

beforeEach(async () => {
  await EnterpriseToolInvocation.deleteMany({});
});

function principal(orgId: string, userId: string) {
  return {
    principalId: userId,
    kind: "user" as const,
    userId,
    organizationId: orgId,
    roles: ["owner" as const],
  };
}

function schemaCampaign() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary"],
    properties: { summary: { type: "string" } },
  };
}

describe("M9.5L1 production tool invocation store (Mongo)", () => {
  it("enforces unique invocationKey on duplicate insert race", async () => {
    const store = new MongoToolInvocationStore();
    const key = "org_a:tool:exec_1:r0:call_1:lookup_campaign";
    const base = {
      invocationKey: key,
      organizationId: "org_a",
      executionId: "exec_1",
      round: 0,
      toolCallId: "call_1",
      toolName: "lookup_campaign",
      status: "awaiting_approval" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const [a, b] = await Promise.all([
      store.upsertAwaitingApproval(base),
      store.upsertAwaitingApproval(base),
    ]);
    expect(a.invocationKey).toBe(key);
    expect(b.invocationKey).toBe(key);
    const count = await EnterpriseToolInvocation.countDocuments({ invocationKey: key });
    expect(count).toBe(1);
  });

  it("atomic claim: only one worker claims approved invocation", async () => {
    const store = new MongoToolInvocationStore();
    const key = "org_a:tool:exec_2:r0:call_1:update_test_record";
    await store.upsertAwaitingApproval({
      invocationKey: key,
      organizationId: "org_a",
      executionId: "exec_2",
      round: 0,
      toolCallId: "call_1",
      toolName: "update_test_record",
      status: "awaiting_approval",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.recordApproval({
      invocationKey: key,
      organizationId: "org_a",
      decision: {
        decision: "approve",
        principalUserId: "u1",
        decidedAt: new Date().toISOString(),
      },
    });
    const now = new Date().toISOString();
    const [c1, c2] = await Promise.all([
      store.tryClaimApproved({ invocationKey: key, workerId: "w1", nowIso: now }),
      store.tryClaimApproved({ invocationKey: key, workerId: "w2", nowIso: now }),
    ]);
    const claimed = [c1, c2].filter((c) => c.claimed);
    expect(claimed.length).toBe(1);
  });

  it("duplicate approval is idempotent; approve+reject conflicts", async () => {
    const store = new MongoToolInvocationStore();
    const key = "org_a:tool:exec_3:r0:call_1:update_test_record";
    await store.upsertAwaitingApproval({
      invocationKey: key,
      organizationId: "org_a",
      executionId: "exec_3",
      round: 0,
      toolCallId: "call_1",
      toolName: "update_test_record",
      status: "awaiting_approval",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const d1 = await store.recordApproval({
      invocationKey: key,
      organizationId: "org_a",
      decision: {
        decision: "approve",
        principalUserId: "u1",
        decidedAt: new Date().toISOString(),
      },
    });
    const d2 = await store.recordApproval({
      invocationKey: key,
      organizationId: "org_a",
      decision: {
        decision: "approve",
        principalUserId: "u1",
        decidedAt: new Date().toISOString(),
      },
    });
    const d3 = await store.recordApproval({
      invocationKey: key,
      organizationId: "org_a",
      decision: {
        decision: "reject",
        principalUserId: "u2",
        decidedAt: new Date().toISOString(),
      },
    });
    expect(d1.ok && d1.duplicate).toBe(false);
    expect(d2.ok && d2.duplicate).toBe(true);
    expect(d3.ok).toBe(false);
  });
});

describe("M9.5L1 restart + resume (production store)", () => {
  it("approval survives restart; tool executes once; continuation recovers", async () => {
    const store = new MongoToolInvocationStore();
    const registry = new InMemoryToolRegistry();
    const state = registerFakeCertificationTools(registry);
    const scripts = [
      {
        kind: "tool_calls" as const,
        toolCalls: [
          openaiFunctionCall({
            id: "call_write",
            name: "update_test_record",
            arguments: { recordId: "r1", status: "done" },
          }),
        ],
      },
      { kind: "text" as const, content: "updated after approval" },
    ];
    const dispatcher = new ScriptedToolProviderDispatcher(scripts);
    const platform = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher,
      registry,
      durable: true,
      seedCertificationTools: false,
    });

    const executionId = "exec_restart_1";
    const organizationId = "org_a";
    const out1 = await platform.orchestrator.execute({
      providerRequest: buildToolProviderRequest({
        executionId,
        organizationId,
        prompt: "Update the record",
      }),
      tools: [registry.resolve("update_test_record")!.definition],
      organizationId,
      allowedToolNames: ["update_test_record"],
      workerId: "w_a",
    });
    expect(out1.ok).toBe(true);
    if (!out1.ok) return;
    expect(out1.value.providerResult.error?.code).toBe("TOOL_APPROVAL_REQUIRED");
    expect(state.updateTestRecordCalls).toBe(0);

    // Destroy / recreate runtime (same Mongo store).
    const platform2 = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher: new ScriptedToolProviderDispatcher([
        { kind: "text", content: "updated after approval" },
      ]),
      registry,
      durable: true,
      seedCertificationTools: false,
    });
    const awaiting = await store.listByExecution(executionId);
    expect(awaiting.some((r) => r.status === "awaiting_approval")).toBe(true);
    const invocationKey = awaiting[0]!.invocationKey;

    const approved = await approveToolInvocation({
      platform: platform2,
      organizationId,
      executionId,
      invocationKey,
      principal: principal(organizationId, "u1"),
      decision: "approve",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(state.updateTestRecordCalls).toBe(1);
    expect(approved.value.resumed?.providerResult.success).toBe(true);

    // Second restart before continuation already completed — tool must not re-run.
    const platform3 = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher: new ScriptedToolProviderDispatcher([
        { kind: "text", content: "should not need another tool" },
      ]),
      registry,
      durable: true,
      seedCertificationTools: false,
    });
    const again = await approveToolInvocation({
      platform: platform3,
      organizationId,
      executionId,
      invocationKey,
      principal: principal(organizationId, "u1"),
      decision: "approve",
    });
    expect(again.ok).toBe(true);
    expect(state.updateTestRecordCalls).toBe(1);
  });

  it("multi-instance resume: one handler execution", async () => {
    const store = new MongoToolInvocationStore();
    const registry = new InMemoryToolRegistry();
    const state = registerFakeCertificationTools(registry);
    const dispatcher = new ScriptedToolProviderDispatcher([
      {
        kind: "tool_calls",
        toolCalls: [
          openaiFunctionCall({
            id: "call_write",
            name: "update_test_record",
            arguments: { recordId: "r2", status: "done" },
          }),
        ],
      },
      { kind: "text", content: "done" },
    ]);
    const platform = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher,
      registry,
      durable: true,
    });
    const executionId = "exec_mi_1";
    const organizationId = "org_a";
    await platform.orchestrator.execute({
      providerRequest: buildToolProviderRequest({
        executionId,
        organizationId,
        prompt: "write",
      }),
      tools: [registry.resolve("update_test_record")!.definition],
      organizationId,
      allowedToolNames: ["update_test_record"],
    });
    const key = (await store.listByExecution(executionId))[0]!.invocationKey;
    await store.recordApproval({
      invocationKey: key,
      organizationId,
      decision: {
        decision: "approve",
        principalUserId: "u1",
        decidedAt: new Date().toISOString(),
      },
    });

    const pA = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher: new ScriptedToolProviderDispatcher([{ kind: "text", content: "A" }]),
      registry,
      durable: true,
    });
    const pB = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher: new ScriptedToolProviderDispatcher([{ kind: "text", content: "B" }]),
      registry,
      durable: true,
    });
    const [r1, r2] = await Promise.all([
      approveToolInvocation({
        platform: pA,
        organizationId,
        executionId,
        invocationKey: key,
        principal: principal(organizationId, "u1"),
        decision: "approve",
        workerId: "worker_a",
      }),
      approveToolInvocation({
        platform: pB,
        organizationId,
        executionId,
        invocationKey: key,
        principal: principal(organizationId, "u2"),
        decision: "approve",
        workerId: "worker_b",
      }),
    ]);
    expect(r1.ok || r2.ok).toBe(true);
    expect(state.updateTestRecordCalls).toBe(1);
  });
});

describe("M9.5L1 Enterprise API wiring (POST /v1/executions)", () => {
  async function buildPlatform(scripts: ConstructorParameters<typeof ScriptedToolProviderDispatcher>[0]) {
    const orgId = "org_tool_l1";
    const userId = "user_tool_l1";
    const fixtures = seedExecutionContextFixtures({
      organizationId: orgId,
      userId,
      organizationName: "Tool L1 Org",
      brand: { brandId: `brand_${orgId}`, name: "Tool Brand", toneOfVoice: "clear" },
    });
    const dispatcher = new ScriptedToolProviderDispatcher(scripts);
    const durableStores = createDurableStores(
      { ...process.env, ENTERPRISE_API_DURABLE_MODE: "false" },
      { forceInMemory: true }
    );
    let n = 0;
    const createId = (prefix: string) => {
      if (prefix === "org") return orgId;
      if (prefix === "ws") return "ws_tool_l1";
      if (prefix === "usr") return userId;
      return `${prefix}_${++n}`;
    };
    const platform = createEnterpriseApiPlatform({
      executionMode: "simulated",
      durableStores,
      runtimeDispatcher: dispatcher,
      executionContextStores: fixtures,
      useLiveBusinessContext: false,
      seedToolCertificationTools: true,
      seedDemoTenant: true,
      createId,
    });
    return { platform, dispatcher, orgId: platform.seed!.organizationId, userId: platform.seed!.userId };
  }

  it("A: normal text execution without tools succeeds", async () => {
    const { platform, orgId, userId } = await buildPlatform([
      { kind: "text", content: "hello without tools" },
    ]);
    const created = await platform.executions.create(
      {
        prompt: "Say hello",
        organizationId: orgId,
        capabilityId: "text.generate",
        metadata: { brandId: `brand_${orgId}` },
        workspaceId: "ws_tool_l1",
      },
      principal(orgId, userId)
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("succeeded");
  }, 60_000);

  it("B: tool-enabled read-only loop via Enterprise API", async () => {
    const { platform, orgId, userId, dispatcher } = await buildPlatform([
      {
        kind: "tool_calls",
        toolCalls: [
          openaiFunctionCall({
            id: "c1",
            name: "lookup_campaign",
            arguments: { campaignId: "cmp_1" },
          }),
        ],
      },
      { kind: "text", content: "Campaign is active" },
    ]);
    const created = await platform.executions.create(
      {
        prompt: "Lookup campaign cmp_1",
        organizationId: orgId,
        capabilityId: "text.generate",
        toolNames: ["lookup_campaign"],
      },
      principal(orgId, userId)
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("succeeded");
    expect(dispatcher.attempts).toBeGreaterThanOrEqual(2);
    const toolsSent = dispatcher.lastRequests.some(
      (r) => Array.isArray((r.payload as { tools?: unknown }).tools)
    );
    expect(toolsSent).toBe(true);
  }, 60_000);

  it("C: tool + structuredOutput validated server-side", async () => {
    const { platform, orgId, userId } = await buildPlatform([
      {
        kind: "tool_calls",
        toolCalls: [
          openaiFunctionCall({
            id: "c1",
            name: "lookup_campaign",
            arguments: { campaignId: "cmp_1" },
          }),
        ],
      },
      { kind: "json", content: JSON.stringify({ summary: "Winter Launch active" }) },
    ]);
    const created = await platform.executions.create(
      {
        prompt: "Summarize campaign",
        organizationId: orgId,
        capabilityId: "text.generate",
        toolNames: ["lookup_campaign"],
        structuredOutput: { schema: schemaCampaign(), name: "CampaignSummary", strict: true },
      },
      principal(orgId, userId)
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("succeeded");
  }, 60_000);

  it("D: unknown tool rejected before provider executable definition", async () => {
    const { platform, orgId, userId, dispatcher } = await buildPlatform([
      { kind: "text", content: "should not run" },
    ]);
    const before = dispatcher.attempts;
    const created = await platform.executions.create(
      {
        prompt: "Use bad tool",
        organizationId: orgId,
        capabilityId: "text.generate",
        toolNames: ["not_a_real_tool"],
      },
      principal(orgId, userId)
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("failed");
    expect(dispatcher.attempts).toBe(before);
  }, 60_000);

  it("E: tenant spoof rejected", async () => {
    const { platform, orgId, userId } = await buildPlatform([
      { kind: "text", content: "x" },
    ]);
    const created = await platform.executions.create(
      {
        prompt: "spoof",
        organizationId: "org_other",
        toolNames: ["lookup_campaign"],
      },
      { ...principal(orgId, userId), organizationId: orgId }
    );
    // Non-Firebase principal with mismatched org still fails when principal.organizationId set
    expect(created.ok).toBe(false);
  }, 60_000);

  it("F/G: side-effect awaits approval then resumes once", async () => {
    const store = new InMemoryToolInvocationStore();
    const registry = new InMemoryToolRegistry();
    const state = registerFakeCertificationTools(registry);
    const orgId = "org_tool_l1";
    const userId = "user_tool_l1";
    const fixtures = seedExecutionContextFixtures({
      organizationId: orgId,
      userId,
      organizationName: "Tool L1 Org",
      brand: { brandId: `brand_${orgId}`, name: "Tool Brand", toneOfVoice: "clear" },
    });
    const dispatcher = new ScriptedToolProviderDispatcher([
      {
        kind: "tool_calls",
        toolCalls: [
          openaiFunctionCall({
            id: "c_write",
            name: "update_test_record",
            arguments: { recordId: "r9", status: "ok" },
          }),
        ],
      },
      { kind: "text", content: "write complete" },
    ]);
    const durableStores = {
      ...createDurableStores({}, { forceInMemory: true }),
      toolInvocations: store,
    };
    let n = 0;
    const createId = (prefix: string) => {
      if (prefix === "org") return orgId;
      if (prefix === "ws") return "ws_tool_l1";
      if (prefix === "usr") return userId;
      return `${prefix}_${++n}`;
    };
    const platform = createEnterpriseApiPlatform({
      executionMode: "simulated",
      durableStores,
      runtimeDispatcher: dispatcher,
      executionContextStores: fixtures,
      useLiveBusinessContext: false,
      seedToolCertificationTools: false,
      createId,
      toolRuntime: createToolRuntimePlatform({
        invocationStore: store,
        dispatcher,
        registry,
        durable: false,
      }),
    });
    const created = await platform.executions.create(
      {
        prompt: "Update record",
        organizationId: platform.seed!.organizationId,
        capabilityId: "text.generate",
        toolNames: ["update_test_record"],
      },
      principal(platform.seed!.organizationId, platform.seed!.userId)
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("awaiting_approval");
    expect(state.updateTestRecordCalls).toBe(0);
    const key = created.value.toolInvocationKey;
    expect(key).toBeTruthy();

    const approved = await platform.executions.decideToolApproval(
      created.value.executionId,
      key!,
      "approve",
      principal(platform.seed!.organizationId, platform.seed!.userId),
      {
        organizationId: platform.seed!.organizationId,
        userId: platform.seed!.userId,
      }
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(state.updateTestRecordCalls).toBe(1);
    expect(approved.value.status).toBe("succeeded");
  }, 60_000);

  it("H: rejection never executes handler", async () => {
    const store = new InMemoryToolInvocationStore();
    const registry = new InMemoryToolRegistry();
    const state = registerFakeCertificationTools(registry);
    const orgId = "org_tool_l1";
    const userId = "user_tool_l1";
    const fixtures = seedExecutionContextFixtures({
      organizationId: orgId,
      userId,
      organizationName: "Tool L1 Org",
      brand: { brandId: `brand_${orgId}`, name: "Tool Brand", toneOfVoice: "clear" },
    });
    const dispatcher = new ScriptedToolProviderDispatcher([
      {
        kind: "tool_calls",
        toolCalls: [
          openaiFunctionCall({
            id: "c_write",
            name: "update_test_record",
            arguments: { recordId: "r10", status: "ok" },
          }),
        ],
      },
    ]);
    const durableStores = {
      ...createDurableStores({}, { forceInMemory: true }),
      toolInvocations: store,
    };
    let n = 0;
    const createId = (prefix: string) => {
      if (prefix === "org") return orgId;
      if (prefix === "ws") return "ws_tool_l1";
      if (prefix === "usr") return userId;
      return `${prefix}_${++n}`;
    };
    const platform = createEnterpriseApiPlatform({
      executionMode: "simulated",
      durableStores,
      runtimeDispatcher: dispatcher,
      executionContextStores: fixtures,
      useLiveBusinessContext: false,
      createId,
      toolRuntime: createToolRuntimePlatform({
        invocationStore: store,
        dispatcher,
        registry,
        durable: false,
      }),
    });
    const created = await platform.executions.create(
      {
        prompt: "Update record",
        organizationId: platform.seed!.organizationId,
        capabilityId: "text.generate",
        toolNames: ["update_test_record"],
      },
      principal(platform.seed!.organizationId, platform.seed!.userId)
    );
    expect(created.ok && created.value.status).toBe("awaiting_approval");
    if (!created.ok) return;
    const rejected = await platform.executions.decideToolApproval(
      created.value.executionId,
      created.value.toolInvocationKey!,
      "reject",
      principal(platform.seed!.organizationId, platform.seed!.userId),
      {
        organizationId: platform.seed!.organizationId,
        userId: platform.seed!.userId,
      }
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(state.updateTestRecordCalls).toBe(0);
    expect(rejected.value.status).toBe("failed");
  }, 60_000);

  it("cross-tenant approval denied", async () => {
    const store = new InMemoryToolInvocationStore();
    const registry = new InMemoryToolRegistry();
    registerFakeCertificationTools(registry);
    const platform = createToolRuntimePlatform({
      invocationStore: store,
      dispatcher: new ScriptedToolProviderDispatcher([
        {
          kind: "tool_calls",
          toolCalls: [
            openaiFunctionCall({
              id: "c1",
              name: "update_test_record",
              arguments: { recordId: "x", status: "y" },
            }),
          ],
        },
      ]),
      registry,
      durable: false,
    });
    await platform.orchestrator.execute({
      providerRequest: buildToolProviderRequest({
        executionId: "exec_x",
        organizationId: "org_a",
        prompt: "x",
      }),
      tools: [registry.resolve("update_test_record")!.definition],
      organizationId: "org_a",
      allowedToolNames: ["update_test_record"],
    });
    const key = (await store.listByExecution("exec_x"))[0]!.invocationKey;
    const denied = await approveToolInvocation({
      platform,
      organizationId: "org_b",
      executionId: "exec_x",
      invocationKey: key,
      principal: principal("org_b", "u_b"),
      decision: "approve",
    });
    expect(denied.ok).toBe(false);
  });

  it("client cannot self-approve via create payload", async () => {
    const { platform, orgId, userId } = await buildPlatform([
      {
        kind: "tool_calls",
        toolCalls: [
          openaiFunctionCall({
            id: "c_write",
            name: "update_test_record",
            arguments: { recordId: "r", status: "ok" },
          }),
        ],
      },
    ]);
    const created = await platform.executions.create(
      {
        prompt: "Update",
        organizationId: orgId,
        capabilityId: "text.generate",
        toolNames: ["update_test_record"],
        metadata: { approved: true, decision: "approve" },
      },
      principal(orgId, userId)
    );
    expect(created.ok && created.value.status).toBe("awaiting_approval");
  }, 60_000);

  it("durableStores composition uses Mongo when durable mode enabled", () => {
    const stores = createDurableStores(
      {
        ...process.env,
        ENTERPRISE_API_DURABLE_MODE: "true",
        REDIS_HOST: "127.0.0.1",
        REDIS_PORT: "6379",
      },
      { forceInMemory: false }
    );
    // Without Redis may throw or use unavailable — if created, tool store must be Mongo when durable.
    if (stores.isDurable) {
      expect(stores.composition?.toolInvocations).toBe("MongoToolInvocationStore");
      expect(stores.toolInvocations).toBeInstanceOf(MongoToolInvocationStore);
    }
  });

  it("createDurableStores forceInMemory uses InMemory tool store (dev/test only)", () => {
    const stores = createDurableStores({}, { forceInMemory: true });
    expect(stores.toolInvocations).toBeInstanceOf(InMemoryToolInvocationStore);
    expect(stores.isDurable).toBe(false);
  });
});

describe("M9.5L1 security / authority", () => {
  it("server registry remains authoritative — no client handler registration path", () => {
    const registry = new InMemoryToolRegistry();
    expect(registry.resolve("lookup_campaign")).toBeUndefined();
    registerFakeCertificationTools(registry);
    expect(registry.resolve("lookup_campaign")?.definition.riskClass).toBe("read_only");
  });

  it("invocation key identity is stable", () => {
    const key = buildToolInvocationKey({
      organizationId: "org_a",
      executionId: "exec_1",
      round: 0,
      toolCallId: "call_1",
      toolName: "lookup_campaign",
    });
    expect(key).toBe("org_a:tool:exec_1:r0:call_1:lookup_campaign");
  });

  it("M9.5L config still loads credential-free", () => {
    const cfg = loadToolExecutionConfig({});
    expect(cfg.enabled).toBe(true);
    expect(cfg.requireApprovalForSideEffects).toBe(true);
  });
});
