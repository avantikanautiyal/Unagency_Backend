/**
 * Priority helpers.
 */

import type { JobPriority } from "../contracts/enums";
import { PRIORITY_SCORES } from "../constants";

export function priorityScore(priority: JobPriority): number {
  return PRIORITY_SCORES[priority];
}
