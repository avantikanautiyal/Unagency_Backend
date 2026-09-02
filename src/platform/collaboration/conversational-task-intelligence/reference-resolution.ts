/**
 * Priority 4.5 / 4.7 — Reference resolution for artifacts, executions, versions, routes, child assets.
 */

import type { ServiceAiMessageRecord } from "../service-conversation-types";
import type {
  ConversationalTaskIntelligenceState,
  ConversationalTaskThread,
  ResolvedReference,
  ResolvedRouteAsset,
} from "./conversational-task-contract";
import type { SemanticSignals } from "./semantic-signals";

function parseOrdinalIndex(text: string): number | undefined {
  const match = text.match(
    /\b(?:#?\s*)?(first|second|third|fourth|1st|2nd|3rd|4th|one|two|three|four|\d+)\b/i,
  );
  if (!match?.[1]) return undefined;
  const token = match[1].toLowerCase();
  const map: Record<string, number> = {
    first: 1,
    one: 1,
    "1st": 1,
    second: 2,
    two: 2,
    "2nd": 2,
    third: 3,
    three: 3,
    "3rd": 3,
    fourth: 4,
    four: 4,
    "4th": 4,
  };
  const index = map[token] ?? Number.parseInt(token, 10);
  return Number.isFinite(index) && index > 0 ? index : undefined;
}

function parseVersionIndex(text: string): number | undefined {
  const vMatch = text.match(/\bversion\s*#?\s*(\d+)\b/i);
  if (vMatch?.[1]) return Number.parseInt(vMatch[1], 10);
  const short = text.match(/\bv(\d+)\b/i);
  if (short?.[1]) return Number.parseInt(short[1], 10);
  return undefined;
}

function parseRouteIndex(text: string): number | undefined {
  const spaced = text.match(
    /\b(?:route|option|direction|concept|choice)\s*(?:#?\s*)?(\d+|one|two|three|first|second|third)\b/i,
  );
  const compact = text.match(/\broute(\d+)\b/i);
  const reverse = text.match(
    /\b(one|two|three|first|second|third|\d+)\s+(?:route|option|direction|concept|choice)\b/i,
  );
  const token = spaced?.[1] ?? compact?.[1] ?? reverse?.[1];
  if (!token) return undefined;
  const map: Record<string, number> = {
    one: 1,
    first: 1,
    two: 2,
    second: 2,
    three: 3,
    third: 3,
  };
  const index = map[token.toLowerCase()] ?? Number.parseInt(token, 10);
  return Number.isFinite(index) && index > 0 ? index : undefined;
}

type RouteRecord = NonNullable<ServiceAiMessageRecord["routes"]>[number];

function routeAssets(route: RouteRecord): readonly ResolvedRouteAsset[] {
  const nested = route.assets;
  if (Array.isArray(nested) && nested.length > 0) {
    return Object.freeze(
      nested
        .filter((a) => a?.id?.trim())
        .map((a) =>
          Object.freeze({
            id: a.id.trim(),
            label: a.label,
            imageUri: a.imageUri,
            artifactId: a.artifactId,
          }),
        ),
    );
  }
  if (route.imageUri?.trim()) {
    return Object.freeze([
      Object.freeze({
        id: route.id,
        label: route.title || route.label,
        imageUri: route.imageUri,
      }),
    ]);
  }
  return Object.freeze([]);
}

function routeFromMessage(
  message: ServiceAiMessageRecord,
  routeIndex?: number,
  routeId?: string,
): {
  routeId?: string;
  routeIndex?: number;
  assets?: readonly ResolvedRouteAsset[];
} {
  const routes = message.routes ?? [];
  if (routeId) {
    const found = routes.find((r) => r.id === routeId);
    if (found) {
      return {
        routeId: found.id,
        routeIndex: routes.indexOf(found) + 1,
        assets: routeAssets(found),
      };
    }
  }
  if (routeIndex && routes[routeIndex - 1]) {
    const found = routes[routeIndex - 1]!;
    return {
      routeId: found.id,
      routeIndex,
      assets: routeAssets(found),
    };
  }
  return {};
}

function execMessagesWithRoutes(
  messages: readonly ServiceAiMessageRecord[],
): ServiceAiMessageRecord[] {
  return [...messages]
    .filter((m) => m.executionId && (m.routes?.length ?? 0) > 0)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

function pickTargetAssets(input: {
  readonly assets: readonly ResolvedRouteAsset[];
  readonly assetOrdinal?: number;
  readonly wantsEach: boolean;
}): readonly ResolvedRouteAsset[] {
  if (input.wantsEach || !input.assetOrdinal) {
    return input.assets;
  }
  const picked = input.assets[input.assetOrdinal - 1];
  return picked ? Object.freeze([picked]) : Object.freeze([]);
}

function primaryArtifactId(
  targetAssets: readonly ResolvedRouteAsset[],
  fallback?: string,
): string | undefined {
  if (targetAssets.length === 1) {
    return targetAssets[0]?.artifactId?.trim() || fallback;
  }
  const withArtifact = targetAssets.find((a) => a.artifactId?.trim());
  return withArtifact?.artifactId?.trim() || fallback;
}

export function resolveReferences(input: {
  readonly message: string;
  readonly signals: SemanticSignals;
  readonly messages: readonly ServiceAiMessageRecord[];
  readonly thread: ConversationalTaskThread;
  readonly taskState: ConversationalTaskIntelligenceState;
}): ResolvedReference | undefined {
  const evidence: string[] = [];
  const routeIndex = parseRouteIndex(input.message);
  const versionIndex = parseVersionIndex(input.message);
  const assetOrdinal = /\blogo\b/i.test(input.message)
    ? parseOrdinalIndex(input.message)
    : undefined;
  const wantsEach =
    input.signals.isAssetExtraction ||
    /\beach\b/i.test(input.message) ||
    /\bindividually\b/i.test(input.message);

  if (input.signals.isTaskSwitch && input.signals.mentionsArtifactType) {
    const target = input.taskState.threads.find(
      (t) =>
        t.label?.toLowerCase().includes(input.signals.mentionsArtifactType!) ||
        t.service?.toLowerCase().includes(input.signals.mentionsArtifactType!),
    );
    if (target) {
      evidence.push(`task_switch:${target.threadId}`);
      return Object.freeze({
        kind: "thread",
        threadId: target.threadId,
        executionId: target.activeExecutionId,
        artifactId: target.activeArtifactId,
        confidence: 0.85,
        evidence: Object.freeze(evidence),
      });
    }
  }

  if (versionIndex !== undefined) {
    const alt = input.thread.alternatives[versionIndex - 1];
    if (alt) {
      evidence.push(`version_index:${versionIndex}`);
      return Object.freeze({
        kind: "version",
        versionIndex,
        executionId: alt.executionId,
        artifactId: alt.artifactId,
        routeId: alt.routeId,
        confidence: 0.9,
        evidence: Object.freeze(evidence),
      });
    }
    if (input.thread.alternatives.length > 0) {
      return Object.freeze({
        kind: "version",
        versionIndex,
        confidence: 0.35,
        evidence: Object.freeze([`ambiguous_version:${versionIndex}`]),
      });
    }
  }

  if (input.signals.hasSuperlativeReference) {
    const isOriginal = /\b(original|initial)\b/i.test(input.message);
    const alt = isOriginal
      ? input.thread.alternatives[0]
      : input.thread.alternatives[input.thread.alternatives.length - 1];
    if (alt) {
      evidence.push(isOriginal ? "superlative:original" : "superlative:latest");
      return Object.freeze({
        kind: "version",
        executionId: alt.executionId,
        artifactId: alt.artifactId,
        routeId: alt.routeId,
        confidence: 0.8,
        evidence: Object.freeze(evidence),
      });
    }
  }

  const execMessages = execMessagesWithRoutes(input.messages);

  if (routeIndex && execMessages.length > 0) {
    const targetMsg =
      execMessages.length === 1
        ? execMessages[0]!
        : execMessages[execMessages.length - 1]!;
    const route = routeFromMessage(targetMsg, routeIndex);
    if (route.routeId) {
      evidence.push(`ordinal_route:${routeIndex}`);
      const targetAssets = pickTargetAssets({
        assets: route.assets ?? Object.freeze([]),
        assetOrdinal,
        wantsEach,
      });
      if (targetAssets.length === 1 && assetOrdinal && !wantsEach) {
        evidence.push(`asset_ordinal:${assetOrdinal}`);
        return Object.freeze({
          kind: "asset",
          routeId: route.routeId,
          routeIndex: route.routeIndex,
          executionId: targetMsg.executionId,
          artifactId: primaryArtifactId(targetAssets, targetMsg.artifactId),
          targetAssetIds: Object.freeze([targetAssets[0]!.id]),
          targetAssets,
          targetAssetIndex: assetOrdinal,
          confidence: execMessages.length === 1 ? 0.92 : 0.78,
          evidence: Object.freeze(evidence),
        });
      }
      if (targetAssets.length > 1 || wantsEach) {
        evidence.push(`route_assets:${targetAssets.length}`);
        return Object.freeze({
          kind: wantsEach ? "assets" : "route",
          routeId: route.routeId,
          routeIndex: route.routeIndex,
          executionId: targetMsg.executionId,
          artifactId: primaryArtifactId(targetAssets, targetMsg.artifactId),
          targetAssetIds: Object.freeze(targetAssets.map((a) => a.id)),
          targetAssets,
          confidence: execMessages.length === 1 ? 0.92 : 0.78,
          evidence: Object.freeze(evidence),
        });
      }
      return Object.freeze({
        kind: "route",
        routeId: route.routeId,
        routeIndex: route.routeIndex,
        executionId: targetMsg.executionId,
        artifactId: primaryArtifactId(route.assets ?? Object.freeze([]), targetMsg.artifactId),
        targetAssetIds: Object.freeze((route.assets ?? []).map((a) => a.id)),
        targetAssets: route.assets,
        confidence: execMessages.length === 1 ? 0.9 : 0.65,
        evidence: Object.freeze(evidence),
      });
    }
  }

  if (
    (input.signals.hasDeicticReference ||
      input.signals.referencesExistingResult ||
      input.signals.hasOrdinalReference) &&
    input.thread.selectedRouteId &&
    input.thread.activeExecutionId
  ) {
    const targetMsg = execMessages.find(
      (m) => m.executionId === input.thread.activeExecutionId,
    );
    if (targetMsg) {
      const route = routeFromMessage(targetMsg, undefined, input.thread.selectedRouteId);
      const assets = route.assets ?? Object.freeze([]);
      const targetAssets = pickTargetAssets({
        assets,
        assetOrdinal,
        wantsEach,
      });
      if (targetAssets.length > 0) {
        evidence.push("selected_route:active");
        return Object.freeze({
          kind: targetAssets.length > 1 || wantsEach ? "assets" : "asset",
          routeId: input.thread.selectedRouteId,
          executionId: input.thread.activeExecutionId,
          artifactId: primaryArtifactId(
            targetAssets,
            input.thread.activeArtifactId,
          ),
          targetAssetIds: Object.freeze(targetAssets.map((a) => a.id)),
          targetAssets,
          targetAssetIndex: assetOrdinal,
          confidence: 0.88,
          evidence: Object.freeze(evidence),
        });
      }
    }
  }

  if (assetOrdinal && !routeIndex && execMessages.length > 0) {
    const targetMsg = execMessages[execMessages.length - 1]!;
    const routeId =
      input.thread.selectedRouteId ?? targetMsg.routes?.[0]?.id;
    if (routeId) {
      const route = routeFromMessage(targetMsg, undefined, routeId);
      const targetAssets = pickTargetAssets({
        assets: route.assets ?? Object.freeze([]),
        assetOrdinal,
        wantsEach: false,
      });
      if (targetAssets.length === 1) {
        evidence.push(`asset_ordinal:${assetOrdinal}`);
        evidence.push(`implicit_route:${routeId}`);
        return Object.freeze({
          kind: "asset",
          routeId,
          routeIndex: route.routeIndex,
          executionId: targetMsg.executionId,
          artifactId: primaryArtifactId(targetAssets, targetMsg.artifactId),
          targetAssetIds: Object.freeze([targetAssets[0]!.id]),
          targetAssets,
          targetAssetIndex: assetOrdinal,
          confidence: 0.86,
          evidence: Object.freeze(evidence),
        });
      }
    }
  }

  if (
    (input.signals.hasDeicticReference || input.signals.referencesExistingResult) &&
    execMessages.length > 1 &&
    !routeIndex &&
    !versionIndex &&
    !assetOrdinal
  ) {
    return Object.freeze({
      kind: "execution",
      confidence: 0.3,
      evidence: Object.freeze(["ambiguous_deictic:multiple_executions"]),
    });
  }

  if (input.signals.hasDeicticReference || input.signals.referencesExistingResult) {
    if (input.thread.activeExecutionId) {
      evidence.push("deictic:active_execution");
      return Object.freeze({
        kind: "execution",
        executionId: input.thread.activeExecutionId,
        artifactId: input.thread.activeArtifactId,
        routeId: input.thread.selectedRouteId,
        confidence: input.thread.activeArtifactId ? 0.85 : 0.7,
        evidence: Object.freeze(evidence),
      });
    }
    if (execMessages.length === 1 && execMessages[0]?.executionId) {
      evidence.push("deictic:single_execution");
      return Object.freeze({
        kind: "execution",
        executionId: execMessages[0].executionId,
        artifactId: execMessages[0].artifactId,
        confidence: 0.75,
        evidence: Object.freeze(evidence),
      });
    }
    if (execMessages.length > 1 && !routeIndex && !versionIndex) {
      return Object.freeze({
        kind: "execution",
        confidence: 0.3,
        evidence: Object.freeze(["ambiguous_deictic:multiple_executions"]),
      });
    }
  }

  if (input.thread.activeArtifactId) {
    evidence.push("default:active_artifact");
    return Object.freeze({
      kind: "artifact",
      artifactId: input.thread.activeArtifactId,
      executionId: input.thread.activeExecutionId,
      confidence: 0.6,
      evidence: Object.freeze(evidence),
    });
  }

  return undefined;
}

export function isAmbiguousReference(ref?: ResolvedReference): boolean {
  return Boolean(ref && ref.confidence < 0.5);
}
