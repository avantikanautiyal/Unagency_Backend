/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "../../../../",
  roots: ["<rootDir>/tests/platform/intelligence/orchestrator"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
  moduleFileExtensions: ["ts", "js", "json"],
};
