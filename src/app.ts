import express from "express";
import cors from "cors";
import mongoose from "mongoose";

//Global Error Handler
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// routs import
import helloWorldRouter from "./routes/hello.route";
import StaffRouter from "./routes/staff.route";
import SubscriptionRouter from "./routes/subscription.route";
import ProjectRouter from "./routes/project.route";
import authRouter from "./routes/auth.route";
import categoryRouter from "./routes/categories.route";
import packagesRouter from "./routes/packages.route";
import teamRouter from "./routes/teams.route";
import userRouter from "./routes/users.route";
import OrganizationsRouter from "./routes/organizations.route";
import ChatRouter from "./routes/chat.route";
import RequirementRouter from "./routes/requirement.route";
import TaskRouter from "./routes/tasks.route";
import NotificationRouter from "./routes/notification.route"
import planRouter from "./routes/plan.routes";
import productAssetsRouter from "./routes/product-assets.route";
import brandRouter from "./routes/brand.route";
import voiceRouter from "./routes/voice.route";
import {
  analyticsRouter,
  preferencesRouter,
  helpRouter,
  savedRoutesRouter,
  searchRouter,
} from "./routes/product-domain.route";
// Legacy BullMQ/cron workers — started explicitly in app.run() (M9.4A)
// Do NOT import queue modules at top-level (leaves open handles in tests).

// middleware
import {
  IsVerifiedUser,
  VerifyUserHandler,
} from "./middlewares/verifyUser.middleware";
import razorpayRouter from "./routes/razorpay.route";
import { razorpayWebhook } from "./webhook/razorpaywebhook";
import dashboardRoute from "./routes/dashboard.route";
import {
  bootstrapEnterpriseApiRuntime,
  bootstrapEnterpriseApiRuntimeAsync,
  logEnterpriseApiMount,
  parseEnterpriseApiExecutionModeFromEnv,
  validateEnterpriseApiExecutionConfig,
  wireIntelligenceControlPlane,
} from "./platform/api/runtime";
import { savedRouteService } from "./services/saved-route-service";
import { createExpressPlatformAdapter } from "./platform/api/transports/express";
import type { EnterpriseApiRuntime } from "./platform/api/runtime";
import { closeSharedRedisClient } from "./platform/infrastructure/durability";

const app = express();

//Use of CORS
app.use(cors());

//Use of Express JSON CONFIG
app.use("/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhook)
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

const enterpriseExecutionMode = parseEnterpriseApiExecutionModeFromEnv();
validateEnterpriseApiExecutionConfig(enterpriseExecutionMode);

let enterpriseApiRuntime: EnterpriseApiRuntime;

if (enterpriseExecutionMode !== "live") {
  enterpriseApiRuntime = bootstrapEnterpriseApiRuntime({
    executionMode: enterpriseExecutionMode,
  });
  savedRouteService.setBrandBrainEngine(enterpriseApiRuntime.platform.brandBrainEngine);
  app.use(
    createExpressPlatformAdapter({ gateway: enterpriseApiRuntime.platform.gateway })
  );
}

type CustomExpress = {
  run: () => Promise<void>;
} & typeof app;

//routes declaration
app.use("/auth", authRouter);
app.use("/dashboard", VerifyUserHandler, dashboardRoute)
app.use("/categories", VerifyUserHandler, categoryRouter);
app.use("/users", VerifyUserHandler, userRouter);
app.use("/organizations", VerifyUserHandler, OrganizationsRouter);
app.use("/teams", VerifyUserHandler, teamRouter);
app.use("/requirement", VerifyUserHandler, RequirementRouter);
app.use("/staff", VerifyUserHandler, StaffRouter);
app.use("/chat", VerifyUserHandler, ChatRouter);
app.use("/projects", VerifyUserHandler, ProjectRouter);
app.use("/packages", VerifyUserHandler, packagesRouter);
app.use("/tasks", VerifyUserHandler, TaskRouter);
app.use("/subscription", VerifyUserHandler, SubscriptionRouter);
app.use("/plans", VerifyUserHandler, planRouter);
app.use("/assets", VerifyUserHandler, productAssetsRouter);
app.use("/voice", VerifyUserHandler, voiceRouter);
app.use("/brands", VerifyUserHandler, brandRouter);
app.use("/analytics", VerifyUserHandler, analyticsRouter);
app.use("/preferences", VerifyUserHandler, preferencesRouter);
app.use("/help", VerifyUserHandler, helpRouter);
app.use("/saved-routes", VerifyUserHandler, savedRoutesRouter);
app.use("/search", VerifyUserHandler, searchRouter);

app.use("/notification", NotificationRouter);

app.use("/razorpay", razorpayRouter);

app.use("/", helloWorldRouter);

// Business Platform analytics endpoint — returns campaign/execution/credit analytics.
// Protected by VerifyUserHandler in production; accessible now for wiring verification.
app.get("/intelligence/business/analytics/:organizationId", VerifyUserHandler, (req, res) => {
  const bp = enterpriseApiRuntime?.platform?.businessPlatform;
  if (!bp) {
    return res.status(503).json({ status: "unavailable" });
  }
  const result = bp.analytics(req.params.organizationId, req.query.workspaceId as string | undefined);
  if (!result.ok) {
    return res.status(400).json({ error: result.error.message });
  }
  return res.json(result.value);
});

// Intelligence costs endpoint — returns aggregated cost data from the telemetry store.
// Public (no auth) for ops/infra visibility; use VerifyUserHandler if exposing to users.
app.get("/intelligence/costs", (_req, res) => {
  const store = enterpriseApiRuntime?.platform?.telemetryStore;
  if (!store) {
    return res.status(503).json({ status: "unavailable", message: "Telemetry store not yet ready" });
  }
  const { aggregateCosts } = require("./platform/infrastructure/observability/costs/cost-intelligence");
  const snapshot = aggregateCosts(store.listCosts());
  return res.json(snapshot);
});

// Intelligence Platform health endpoint — reports the status of every
// subsystem in the kernel (capability registry, provider registry,
// planning engine, orchestrator, runtime).
// Public: no auth required (ops/infra visibility only).
app.get("/intelligence/health", async (_req, res) => {
  const gateway = enterpriseApiRuntime?.platform?.intelligencePlatform?.gateway;
  if (!gateway) {
    return res.status(503).json({ status: "unavailable", message: "Intelligence Gateway not yet bootstrapped" });
  }
  const result = await gateway.health();
  if (!result.ok) {
    return res.status(500).json({ status: "error", message: result.error.message });
  }
  const httpStatus = result.value.status === "healthy" ? 200 : result.value.status === "degraded" ? 207 : 503;
  return res.status(httpStatus).json(result.value);
});

(app as CustomExpress).run = async () => {
  try {
    // LIVE boots async (provider registry). Mount BEFORE 404/error handlers so
    // /v1|/v2 executions are reachable — previously live mounted after ErrorHandler
    // and product generate/enhance calls never hit the Enterprise gateway.
    if (enterpriseExecutionMode === "live") {
      enterpriseApiRuntime = await bootstrapEnterpriseApiRuntimeAsync();
      savedRouteService.setBrandBrainEngine(enterpriseApiRuntime.platform.brandBrainEngine);
      app.use(
        createExpressPlatformAdapter({ gateway: enterpriseApiRuntime.platform.gateway })
      );
    } else {
      await wireIntelligenceControlPlane(enterpriseApiRuntime.platform);
    }

    // Invalid Path Error Handler + Error handler (after all routes, including live /v1)
    app.use(RouteErrorHandler);
    app.use(ErrorHandler);

    logEnterpriseApiMount(
      enterpriseApiRuntime.executionMode,
      enterpriseApiRuntime.firebaseBridgeEnabled,
      enterpriseApiRuntime.configuredProviders
    );
    mongoose.connect(process.env.DB_URI!);
    mongoose.connection.on("connected", () => {
      console.log("DB_CONNECTED");
    });

    // Explicit legacy background worker lifecycle (not import side-effect)
    if (process.env.ENTERPRISE_API_START_LEGACY_WORKERS !== "false") {
      await import("./background/queue/taskDeadline.queue");
      await import("./background/queue/notificationCron.queue");
    }

    // Intelligence Orchestrator — control-plane lifecycle coordinator.
    // Bootstrapped as a singleton after providers are ready so it can observe
    // execution lifecycle events without blocking the HTTP path.
    try {
      const { createIntelligenceOrchestrator } = await import(
        "./platform/intelligence/orchestrator/factories/create-orchestrator"
      );
      const { createExecutionRuntime } = await import(
        "./platform/intelligence/execution-runtime/factories/create-execution-runtime"
      );
      const { InMemoryEventBus } = await import(
        "./platform/intelligence/events/implementations/in-memory-event-bus"
      );
      const { EventFactory } = await import(
        "./platform/intelligence/events/implementations/event-factory"
      );
      const eventBus = new InMemoryEventBus();
      const eventFactory = new EventFactory(
        { generate: (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}` },
        { now: () => new Date(), nowIso: () => new Date().toISOString() }
      );
      const orchestratorRuntime = createExecutionRuntime({ eventBus, eventFactory });
      const orchestrator = createIntelligenceOrchestrator({
        runtime: orchestratorRuntime,
        includeDefaultMiddleware: true,
      });
      // Attach to global so the enterprise gateway can optionally emit lifecycle events.
      (globalThis as Record<string, unknown>).__intelligenceOrchestrator = orchestrator;
      console.log("🧠 [AI OS] IntelligenceOrchestrator bootstrapped — control-plane ready");
    } catch (err) {
      console.warn(
        "[AI OS] IntelligenceOrchestrator failed to bootstrap (non-fatal):",
        err instanceof Error ? err.message : err
      );
    }

    // M10.18 — media processing worker (claimable Mongo jobs; not BullMQ)
    let mediaProcessingWorker: { shutdown(): Promise<void> } | undefined;
    try {
      const { startMediaProcessingWorker } = await import(
        "./platform/media/processing/media-processing-worker"
      );
      mediaProcessingWorker = startMediaProcessingWorker();
    } catch (err) {
      console.warn(
        "[M10.18] media processing worker not started:",
        err instanceof Error ? err.message : err
      );
    }

    const server = app.listen(process.env.PORT ?? 4000, () => {
      console.log(
        "⚙️",
        ` Server is running at port : ${process.env.PORT ?? 4000}`
      );
    });

    // M10.19 — first-party Collaboration OS (Socket.IO)
    try {
      const { attachCollaborationSocketGateway } = await import(
        "./platform/collaboration/socket-gateway"
      );
      await attachCollaborationSocketGateway(server);
      console.log("[Collaboration OS] Socket.IO gateway listening on /collaboration/socket.io");
    } catch (err) {
      console.warn(
        "[Collaboration OS] socket gateway failed to start:",
        err instanceof Error ? err.message : err
      );
    }

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`⚙️  Received ${signal}, shutting down gracefully`);
      server.close(() => {
        void (async () => {
          try {
            // M9.5O1 — drain/abort in-flight native streams before stores close.
            try {
              const { getActiveStreamRegistry, loadStreamingRuntimeConfig } =
                await import(
                  "./platform/intelligence/providers/streaming"
                );
              const cfg = loadStreamingRuntimeConfig(process.env);
              await getActiveStreamRegistry().shutdown({
                drainMs: cfg.shutdownDrainMs,
                reason: "server_shutdown",
              });
            } catch {
              /* streaming registry optional if module unload fails */
            }
            try {
              await mediaProcessingWorker?.shutdown();
            } catch {
              /* media worker optional */
            }
            try {
              const { shutdownCollaborationSocketGateway } = await import(
                "./platform/collaboration/socket-gateway"
              );
              await shutdownCollaborationSocketGateway();
            } catch {
              /* collaboration optional */
            }
            await enterpriseApiRuntime?.platform.distributed.shutdown();
            await closeSharedRedisClient();
            await mongoose.connection.close();
          } finally {
            process.exit(0);
          }
        })();
      });
      setTimeout(() => process.exit(1), 15_000).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
