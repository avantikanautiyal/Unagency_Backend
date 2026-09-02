/**
 * Create-execution pipeline — prepass → dispatch (direct provider path only).
 */

import { success, type Result } from "../../core/result";
import type { AuthPrincipal, CreateExecutionRequest, ExecutionResource } from "../contracts";
import type { ExecutionCreateHost } from "./execution-create-host";
import { runCreatePrepass } from "./execution-create-prepass";
import { runCreateDispatch } from "./execution-create-dispatch";

export async function runCreateExecution(
  host: ExecutionCreateHost,
  req: CreateExecutionRequest,
  principal: AuthPrincipal
): Promise<Result<ExecutionResource>> {
  const pre = await runCreatePrepass(host, req, principal);
  if (!pre.ok) return pre;
  if (pre.value.kind === "done") return success(pre.value.resource);

  // Direct provider path — no OS/intelligence layer assembly.
  return runCreateDispatch(host, pre.value.state);
}
