/**
 * Deliverable planning contracts.
 */

import type { DeliverableId } from "./identifiers";

export interface DeliverableItem {
  readonly deliverableId: DeliverableId;
  readonly name: string;
  readonly format: string;
  readonly quantity?: number;
  readonly description: string;
  readonly checklist: readonly string[];
}

export interface DeliverablePlan {
  readonly planId: string;
  readonly primaryDeliverable: string;
  readonly items: readonly DeliverableItem[];
  readonly publishingNotes: readonly string[];
  readonly reviewChecklist: readonly string[];
  readonly rationale: string;
}
