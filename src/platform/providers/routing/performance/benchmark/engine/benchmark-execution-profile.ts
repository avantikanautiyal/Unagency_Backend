/**
 * Step 4B — What the benchmark execution environment actually provides.
 * Describes executor capabilities, not model capabilities.
 */

export type BenchmarkExecutionInterface =
  | "text_prompt"
  | "structured_output_mode"
  | "artifact_creation"
  | "code_generation"
  | "file_creation"
  | "image_generation"
  | "image_editing"
  | "video_generation"
  | "video_generation_async"
  | "audio_generation"
  | "browser_tool_execution"
  | "build_execution"
  | "runtime_execution";

export type BenchmarkExecutionProfile = {
  readonly profileId: string;
  readonly profileVersion: string;
  readonly interfaces: readonly BenchmarkExecutionInterface[];
  readonly supportsArtifactCreation: boolean;
  readonly supportsBuildExecution: boolean;
  readonly supportsRuntimeValidation: boolean;
  readonly supportsToolExecution: boolean;
  readonly supportsAsyncPolling: boolean;
};

/** Step 4A/4B real-provider benchmark executor — plain prompt dispatch only. */
export const BENCHMARK_EXECUTOR_PROFILE: BenchmarkExecutionProfile = Object.freeze({
  profileId: "benchmark_executor",
  profileVersion: "1.0.0",
  interfaces: Object.freeze(["text_prompt"]),
  supportsArtifactCreation: false,
  supportsBuildExecution: false,
  supportsRuntimeValidation: false,
  supportsToolExecution: false,
  supportsAsyncPolling: false,
});

/**
 * Step 5 — Benchmark executor wired through canonical DirectExecution + OS materializers.
 * Reuses production structured-output and artifact pipelines; no parallel generators.
 */
export const BENCHMARK_OS_EXECUTOR_PROFILE: BenchmarkExecutionProfile = Object.freeze({
  profileId: "benchmark_os_executor",
  profileVersion: "2.0.0",
  interfaces: Object.freeze([
    "text_prompt",
    "structured_output_mode",
    "artifact_creation",
    "code_generation",
    "file_creation",
    "image_generation",
    "image_editing",
    "build_execution",
  ]),
  supportsArtifactCreation: true,
  supportsBuildExecution: true,
  supportsRuntimeValidation: false,
  supportsToolExecution: false,
  supportsAsyncPolling: false,
});

const EXECUTION_PROFILES_BY_ID: Readonly<Record<string, BenchmarkExecutionProfile>> =
  Object.freeze({
    [BENCHMARK_EXECUTOR_PROFILE.profileId]: BENCHMARK_EXECUTOR_PROFILE,
    [BENCHMARK_OS_EXECUTOR_PROFILE.profileId]: BENCHMARK_OS_EXECUTOR_PROFILE,
  });

export function resolveExecutionProfileById(
  profileId: string | undefined,
): BenchmarkExecutionProfile {
  if (profileId && EXECUTION_PROFILES_BY_ID[profileId]) {
    return EXECUTION_PROFILES_BY_ID[profileId]!;
  }
  return BENCHMARK_EXECUTOR_PROFILE;
}

export function executionProfileProvides(
  profile: BenchmarkExecutionProfile,
  required: BenchmarkExecutionInterface,
): boolean {
  return profile.interfaces.includes(required);
}

export function missingExecutionInterfaces(
  profile: BenchmarkExecutionProfile,
  required: readonly BenchmarkExecutionInterface[],
): readonly BenchmarkExecutionInterface[] {
  return required.filter((iface) => !profile.interfaces.includes(iface));
}
