/**
 * Topology builder for mesh snapshot.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { ProviderMeshTopology } from "../contracts/result";

export class DefaultTopologyBuilder {
  build(records: readonly ProviderOperationalRecord[]): Result<ProviderMeshTopology> {
    const nodes = records.map((r) => r.providerId);
    const edges: { readonly from: string; readonly to: string; readonly kind: string }[] = [];

    const ranked = [...records].sort(
      (a, b) => b.compositeScore.overall - a.compositeScore.overall
    );

    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        edges.push({
          from: ranked[i]!.providerId,
          to: ranked[j]!.providerId,
          kind: "failover_candidate",
        });
      }
    }

    return success({ nodes, edges });
  }
}
