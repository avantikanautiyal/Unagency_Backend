/**
 * Idempotent category bootstrap for clean local/test DBs (M10.4 Phase 0).
 *
 * Reuses CATEGORY_SPECS from seed-demo-constants (single catalog SoT).
 * Safe across restarts — upsert by title. No FE fixtures.
 *
 * Usage:
 *   npm run seed:categories
 *
 * Production guard:
 *   set ALLOW_CATEGORY_SEED=true to run when NODE_ENV=production
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Categories from "../src/models/categories.model";
import { CATEGORY_SPECS } from "./seed-demo-constants";

dotenv.config();

export async function upsertCanonicalCategories(): Promise<number> {
  let count = 0;
  for (const spec of CATEGORY_SPECS) {
    const featuredImage = `https://picsum.photos/seed/${spec.slug}/400/400`;
    await Categories.findOneAndUpdate(
      { title: spec.title },
      {
        $set: {
          title: spec.title,
          featuredImage,
          tagline: spec.tagline,
          tags: spec.tagline ? [spec.tagline] : [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  return count;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_CATEGORY_SEED !== "true") {
    console.error(
      "Refusing category seed in production without ALLOW_CATEGORY_SEED=true"
    );
    process.exitCode = 1;
    return;
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGO_URI (or MONGODB_URI) is required");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUri);
  console.log("→ Upserting canonical categories...");
  const n = await upsertCanonicalCategories();
  console.log(`✅ ${n} categories upserted (idempotent by title)`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("❌ Category seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => undefined);
      process.exit();
    });
}
