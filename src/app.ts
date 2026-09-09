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
// Execution creates carry CDF continuity + brand metadata; 16kb caused HTTP 413.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const enterpriseExecutionMode = parseEnterpriseApiExecutionModeFromEnv();
validateEnterpriseApiExecutionConfig(enterpriseExecutionMode);

let enterpriseApiRuntime: EnterpriseApiRuntime;

if (enterpriseExecutionMode !== "live") {
  enterpriseApiRuntime = bootstrapEnterpriseApiRuntime({
    executionMode: enterpriseExecutionMode,
  });
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

// Runtime cost telemetry — aggregated from the observability store.
app.get("/runtime/costs", (_req, res) => {
  const store = enterpriseApiRuntime?.platform?.telemetryStore;
  if (!store) {
    return res.status(503).json({ status: "unavailable", message: "Telemetry store not yet ready" });
  }
  const { aggregateCosts } = require("./platform/infrastructure/observability/costs/cost-intelligence");
  const snapshot = aggregateCosts(store.listCosts());
  return res.json(snapshot);
});
app.get("/intelligence/costs", (_req, res) => {
  const store = enterpriseApiRuntime?.platform?.telemetryStore;
  if (!store) {
    return res.status(503).json({ status: "unavailable", message: "Telemetry store not yet ready" });
  }
  const { aggregateCosts } = require("./platform/infrastructure/observability/costs/cost-intelligence");
  const snapshot = aggregateCosts(store.listCosts());
  return res.json(snapshot);
});

// Direct execution health.
app.get("/runtime/health", (_req, res) => {
  return res.status(200).json({
    status: "healthy",
    mode: "direct_provider",
    message: "Direct provider execution active",
  });
});
app.get("/intelligence/health", (_req, res) => {
  return res.status(200).json({
    status: "healthy",
    mode: "direct_provider",
    message: "Deprecated alias — use /runtime/health",
  });
});

(app as CustomExpress).run = async () => {
  try {
    // Keep the API process alive across transient Atlas/Redis blips.
    // Without these handlers, MongoServerSelectionError / ETIMEDOUT crash npm start.
    const isTransientInfraError = (err: unknown): boolean => {
      const message = err instanceof Error ? err.message : String(err ?? "");
      const name = err instanceof Error ? err.name : "";
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code ?? "")
          : "";
      return (
        name === "MongoServerSelectionError" ||
        name === "MongoNetworkTimeoutError" ||
        name === "MongoNetworkError" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        /ETIMEDOUT|ECONNRESET|ECONNREFUSED|MongoServerSelection|ReplicaSetNoPrimary|timed out/i.test(
          message
        )
      );
    };

    process.on("unhandledRejection", (reason) => {
      if (isTransientInfraError(reason)) {
        console.warn(
          "[infra] transient unhandledRejection (kept alive):",
          reason instanceof Error ? reason.message : reason
        );
        return;
      }
      console.error("[infra] unhandledRejection:", reason);
    });
    process.on("uncaughtException", (err) => {
      if (isTransientInfraError(err)) {
        console.warn(
          "[infra] transient uncaughtException (kept alive):",
          err.message
        );
        return;
      }
      console.error("[infra] uncaughtException:", err);
      process.exit(1);
    });

    mongoose.connection.on("connected", () => {
      console.log("DB_CONNECTED");
    });
    mongoose.connection.on("error", (err) => {
      console.warn("[mongo] connection error:", err.message);
    });
    mongoose.connection.on("disconnected", () => {
      console.warn("[mongo] disconnected — waiting to reconnect");
    });
    mongoose.connection.on("reconnected", () => {
      console.log("[mongo] reconnected");
    });

    await mongoose.connect(process.env.DB_URI!, {
      serverSelectionTimeoutMS: 15_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 20,
      // Driver buffers ops while reconnecting instead of failing the process.
      bufferCommands: true,
    });

    // LIVE boots async (provider registry + accounting). Mount BEFORE 404/error handlers so
    // /v1|/v2 executions are reachable — previously live mounted after ErrorHandler
    // and product generate/enhance calls never hit the Enterprise gateway.
    if (enterpriseExecutionMode === "live") {
      enterpriseApiRuntime = await bootstrapEnterpriseApiRuntimeAsync();
      app.use(
        createExpressPlatformAdapter({ gateway: enterpriseApiRuntime.platform.gateway })
      );
    }

    // Invalid Path Error Handler + Error handler (after all routes, including live /v1)
    app.use(RouteErrorHandler);
    app.use(ErrorHandler);

    logEnterpriseApiMount(
      enterpriseApiRuntime.executionMode,
      enterpriseApiRuntime.firebaseBridgeEnabled,
      enterpriseApiRuntime.configuredProviders
    );

    void (async () => {
      try {
        const { collaborationOsService } = await import(
          "./platform/collaboration/collaboration-os-service"
        );
        const count = await collaborationOsService.backfillServiceChannelOversight();
        if (count > 0) {
          console.log(
            `[collaboration] synced admin oversight on ${count} service channel(s)`
          );
        }
      } catch (err) {
        console.warn(
          "[collaboration] service channel oversight backfill skipped:",
          err instanceof Error ? err.message : err
        );
      }
    })();

    try {
      const { runEnterpriseAdaptiveRoutingStartupValidation } = await import(
        "./platform/api/runtime/adaptive-routing-startup"
      );
      await runEnterpriseAdaptiveRoutingStartupValidation(enterpriseApiRuntime.platform);
    } catch (err) {
      console.warn(
        "[UNAGENCY-ADAPTIVE-ROUTING] startup validation failed (fail closed):",
        err instanceof Error ? err.message : err,
      );
    }

    if (process.env.ENTERPRISE_API_START_LEGACY_WORKERS !== "false") {
      await import("./background/queue/taskDeadline.queue");
      await import("./background/queue/notificationCron.queue");
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

    // Pump durable queued jobs (website/deck/doc) — in-memory queues are lost on restart.
    let distributedExecutionTimer: ReturnType<typeof setInterval> | undefined;
    let distributedTickInFlight = false;
    const distributed = enterpriseApiRuntime?.platform?.distributed;
    if (distributed) {
      distributed.registerWorker("execution", 4);
      console.log("⚙️  [Direct] distributed execution worker started (1s tick)");
      const pumpDistributedJobs = () => {
        if (distributedTickInFlight) return;
        distributedTickInFlight = true;
        void distributed
          .tick(4)
          .catch((err: unknown) => {
            console.warn(
              "[Direct] distributed job tick failed:",
              err instanceof Error ? err.message : err
            );
          })
          .finally(() => {
            distributedTickInFlight = false;
          });
      };
      pumpDistributedJobs();
      distributedExecutionTimer = setInterval(pumpDistributedJobs, 1000);
      distributedExecutionTimer.unref?.();
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
                  "./platform/providers/streaming"
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
            if (distributedExecutionTimer) {
              clearInterval(distributedExecutionTimer);
              distributedExecutionTimer = undefined;
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
