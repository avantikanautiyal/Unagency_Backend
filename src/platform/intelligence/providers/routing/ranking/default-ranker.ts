/**
 * Default routing ranker — delegates to strategy implementations.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingScore } from "../contracts/candidate";
import type { RoutingStrategyKind } from "../contracts/enums";
import type { RoutingRequest } from "../contracts/request";
import type { IRoutingRanker } from "../interfaces/routing";
import { strategyFor } from "../strategies/routing-strategies";

export class DefaultRoutingRanker implements IRoutingRanker {
  rank(
    scores: readonly RoutingScore[],
    strategy: RoutingStrategyKind,
    request: RoutingRequest
  ): Result<readonly RoutingScore[]> {
    return strategyFor(strategy).rank(scores, request);
  }
}
