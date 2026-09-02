/**
 * M9.2D1 guard — production composition must not import seed fixtures.
 */

import * as fs from "fs";
import * as path from "path";

const PRODUCTION_ROOTS = [
  "src/platform/api/factories",
  "src/platform/api/runtime",
  "src/platform/api/services",
  "src/platform/direct",
  "src/platform/infrastructure/execution/factories",
];

describe("M9.2D1 seed-fixture guard", () => {
  it("does not import seed-fixtures in production composition paths", () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    const offenders: string[] = [];

    for (const rel of PRODUCTION_ROOTS) {
      const dir = path.join(repoRoot, rel);
      if (!fs.existsSync(dir)) continue;
      walk(dir, (file) => {
        if (!file.endsWith(".ts")) return;
        const content = fs.readFileSync(file, "utf8");
        if (
          content.includes("seed-fixtures") ||
          content.includes("seedExecutionContextFixtures")
        ) {
          offenders.push(path.relative(repoRoot, file));
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}
