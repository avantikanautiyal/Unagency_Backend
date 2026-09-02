/**
 * M9.2C regression guard — sampleContextBuildRequest must not appear in production composition.
 */

import * as fs from "fs";
import * as path from "path";

const PRODUCTION_ROOTS = [
  "src/platform/direct",
  "src/platform/api/services",
];

describe("M9.2C sample context guard", () => {
  it("does not reference sampleContextBuildRequest in production integration paths", () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    const offenders: string[] = [];

    for (const rel of PRODUCTION_ROOTS) {
      const dir = path.join(repoRoot, rel);
      if (!fs.existsSync(dir)) continue;
      walk(dir, (file) => {
        if (!file.endsWith(".ts")) return;
        const content = fs.readFileSync(file, "utf8");
        if (content.includes("sampleContextBuildRequest")) {
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
