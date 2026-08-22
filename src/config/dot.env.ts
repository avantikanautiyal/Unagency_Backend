import * as dotenv from "dotenv";
import { syncBilledProviderEnvFromDotenvFile } from "../platform/production/execution/sync-billed-provider-env";

export function config() {
  // Prefer `.env` values over stale shell exports for uncommented keys.
  dotenv.config({ override: true });
  const cleared = syncBilledProviderEnvFromDotenvFile();
  if (cleared.length > 0) {
    console.log(
      `🧠 [AI OS] cleared leftover provider env (commented/absent in .env): ${cleared.join(", ")}`
    );
  }
}
