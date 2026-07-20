/**
 * Deployment migration runner — uses Persistence platform public factory only.
 * Does not modify Intelligence or Business modules.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");

async function main() {
  const env = process.env.MIGRATION_ENV || process.env.NODE_ENV || "production";
  const dialect = process.env.PERSISTENCE_DIALECT || "memory";

  let createPersistencePlatform;
  try {
    createPersistencePlatform = require(path.join(
      process.cwd(),
      "dist/platform/persistence/factories/create-persistence-platform.js"
    )).createPersistencePlatform;
  } catch {
    try {
      createPersistencePlatform = require(path.join(
        process.cwd(),
        "src/platform/persistence/factories/create-persistence-platform.ts"
      )).createPersistencePlatform;
    } catch (e) {
      console.error("[migration] persistence factory unavailable", e.message);
      process.exit(1);
    }
  }

  const { engine } = createPersistencePlatform({ dialect });
  const result = await engine.migrations().migrate(mapEnv(env));
  if (!result.ok) {
    console.error("[migration] failed", result.error);
    process.exit(1);
  }
  console.log(
    `[migration] applied ${result.value.length} migrations env=${env} dialect=${dialect}`
  );
}

function mapEnv(env) {
  if (env === "production" || env === "staging" || env === "test" || env === "development") {
    return env;
  }
  return "production";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
