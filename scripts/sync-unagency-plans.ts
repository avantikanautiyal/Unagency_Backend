/**
 * Upsert local Plans from canonical catalog + env Razorpay Plan IDs.
 * Does NOT create Razorpay plans.
 *
 * Usage: TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/sync-unagency-plans.ts
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import mongoose from "mongoose";
import { syncCanonicalPlansToDatabase } from "../src/billing/sync-canonical-plans";

async function main() {
  const uri = process.env.DB_URI;
  if (!uri) {
    console.error("DB_URI is required");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const result = await syncCanonicalPlansToDatabase();
  console.log("Synced plans:", result.upserted.join(", "));
  for (const [code, id] of Object.entries(result.razorpayPlanIds)) {
    console.log(`  ${code} -> ${id}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
