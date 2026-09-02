/**
 * Phase 8 — OS durable store bundle (in-memory for tests, Mongo for production).
 */

import type { IOsWorkQueue } from "../../os/runtime/contracts/os-work-job";
import { InMemoryOsWorkQueue } from "../../os/runtime/queues/in-memory-os-work-queue";
import type { IEvaluationLedger } from "../../os/evaluation/persistence/evaluation-ledger";
import { InMemoryEvaluationLedger } from "../../os/evaluation/persistence/evaluation-ledger";
import type { IGovernanceDecisionStore } from "../../os/governance/persistence/governance-decision-store";
import { InMemoryGovernanceDecisionStore } from "../../os/governance/persistence/governance-decision-store";
import type { IHumanReviewStore } from "../../os/governance/human-review";
import { InMemoryHumanReviewStore } from "../../os/governance/human-review";
import type { IRefinementStore } from "../../os/refinement/engine/refinement-engine";
import { InMemoryRefinementStore } from "../../os/refinement/engine/refinement-engine";
import type { IFeedbackSessionStore } from "../../os/refinement/engine/feedback-session-engine";
import { InMemoryFeedbackSessionStore } from "../../os/refinement/engine/feedback-session-engine";
import type { IArtifactVersionStore } from "../../os/delivery/artifact/artifact-version-store";
import { InMemoryArtifactVersionStore } from "../../os/delivery/artifact/artifact-version-store";
import type { IDeliveryReceiptStore } from "../../os/delivery/persistence/delivery-receipt-store";
import { InMemoryDeliveryReceiptStore } from "../../os/delivery/persistence/delivery-receipt-store";
import { MongoOsWorkQueue } from "./repositories/mongo-os-work-queue";
import {
  MongoArtifactVersionStore,
  MongoDeliveryReceiptStore,
  MongoEvaluationLedger,
  MongoFeedbackSessionStore,
  MongoGovernanceDecisionStore,
  MongoHumanReviewStore,
  MongoRefinementStore,
} from "./repositories/mongo-os-ledgers";

export interface OsDurableBundle {
  readonly workQueue: IOsWorkQueue;
  readonly evaluations: IEvaluationLedger;
  readonly governance: IGovernanceDecisionStore;
  readonly humanReviews: IHumanReviewStore;
  readonly refinements: IRefinementStore;
  readonly feedbackSessions: IFeedbackSessionStore;
  readonly artifacts: IArtifactVersionStore;
  readonly deliveries: IDeliveryReceiptStore;
  readonly composition: string;
}

export function createInMemoryOsDurableBundle(): OsDurableBundle {
  return {
    workQueue: new InMemoryOsWorkQueue(),
    evaluations: new InMemoryEvaluationLedger(),
    governance: new InMemoryGovernanceDecisionStore(),
    humanReviews: new InMemoryHumanReviewStore(),
    refinements: new InMemoryRefinementStore(),
    feedbackSessions: new InMemoryFeedbackSessionStore(),
    artifacts: new InMemoryArtifactVersionStore(),
    deliveries: new InMemoryDeliveryReceiptStore(),
    composition: "in-memory",
  };
}

export function createMongoOsDurableBundle(): OsDurableBundle {
  return {
    workQueue: new MongoOsWorkQueue(),
    evaluations: new MongoEvaluationLedger(),
    governance: new MongoGovernanceDecisionStore(),
    humanReviews: new MongoHumanReviewStore(),
    refinements: new MongoRefinementStore(),
    feedbackSessions: new MongoFeedbackSessionStore(),
    artifacts: new MongoArtifactVersionStore(),
    deliveries: new MongoDeliveryReceiptStore(),
    composition: "mongo",
  };
}
