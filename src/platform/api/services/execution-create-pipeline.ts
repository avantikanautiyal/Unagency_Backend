/**
 * Create-execution pipeline — thin orchestrator over prepass, OS assembly, dispatch.
 */

import { success, type Result } from "../../intelligence/shared/result";
import type { AuthPrincipal, CreateExecutionRequest, ExecutionResource } from "../contracts";
import type { ExecutionCreateHost } from "./execution-create-host";
import { runCreatePrepass } from "./execution-create-prepass";
import { runOsContextAssembly } from "./execution-os-context-assembly";
import { runCreateDispatch } from "./execution-create-dispatch";

export async function runCreateExecution(
  host: ExecutionCreateHost,
  req: CreateExecutionRequest,
  principal: AuthPrincipal
): Promise<Result<ExecutionResource>> {
  const pre = await runCreatePrepass(host, req, principal);
  if (!pre.ok) return pre;
  if (pre.value.kind === "done") return success(pre.value.resource);

  const assembled = await runOsContextAssembly(host, pre.value.state);
  if (!assembled.ok) return assembled;
  if (assembled.value.kind === "done") return success(assembled.value.resource);

  return runCreateDispatch(host, assembled.value.state);
}
