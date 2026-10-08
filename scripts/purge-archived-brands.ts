/**
 * One-time cleanup: permanently delete brands that were archived by the old
 * "Delete brand" button, cascading to their projects, chats, creatives and files.
 *
 * Dry run (lists only): TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/purge-archived-brands.ts
 * Apply:                TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/purge-archived-brands.ts --execute
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import mongoose from "mongoose";
import Brands from "../src/models/brand.model";
import { brandService } from "../src/services/brand-service";

async function main() {
  const uri = process.env.DB_URI;
  if (!uri) {
    console.error("DB_URI is required");
    process.exit(1);
  }
  const execute = process.argv.includes("--execute");
  await mongoose.connect(uri);

  const archived = await Brands.find({ status: "archived" })
    .select("_id name ownerUserId")
    .lean();
  console.log(`Archived brands: ${archived.length}${execute ? "" : " (dry run)"}`);

  let failed = 0;
  for (const brand of archived) {
    const label = `${brand.name} (${String(brand._id)})`;
    if (!execute) {
      console.log(`  would delete ${label}`);
      continue;
    }
    try {
      const result = await brandService.remove({
        userId: String(brand.ownerUserId),
        brandId: String(brand._id),
      });
      console.log(`  deleted ${label} — ${result.deletedProjects} project(s)`);
    } catch (err) {
      failed += 1;
      console.error(`  failed ${label}:`, err instanceof Error ? err.message : err);
    }
  }

  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
