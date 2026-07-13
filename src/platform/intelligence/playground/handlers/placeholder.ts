import { NotImplementedError } from "../../shared/errors";

/**
 * Placeholder handlers. Not wired to Express in M0.
 */
export async function playgroundNotImplemented(): Promise<never> {
  throw new NotImplementedError(
    "Intelligence playground handlers are reserved for a future milestone"
  );
}
