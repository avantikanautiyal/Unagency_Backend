/**
 * Conversation-scoped logo choice: the user is asked once per conversation
 * which logo to use, and every later turn / pipeline step reuses that answer.
 */

import type { ServiceAiConversationState } from "../service-conversation-types";
import {
  discoverAuthoritativeLogoInputs,
  jobCreatesNewLogo,
  type AuthoritativeLogoDiscoveryResult,
} from "./discover-authoritative-logo-inputs";
import type { AuthoritativeLogoSpec } from "./execution-specification";

const LOGO_CHANGE_REQUEST =
  /\b(?:change|switch|swap)\s+(?:the\s+|our\s+|my\s+)?logo\b|\b(?:use|pick|choose|select|try)\s+(?:a\s+|an\s+|the\s+)?(?:different|another|other)\s+logo\b|\bwhich\s+logo\b/i;

/** True when the user asks to pick the conversation's logo again. */
export function isLogoChangeRequest(message: string): boolean {
  return LOGO_CHANGE_REQUEST.test(message);
}

/**
 * The remembered logo applies when nothing in this turn overrides it: no fresh
 * selection, no logo attached to the prompt, no request to change it, and the
 * asset is still a vault logo of the conversation's brand.
 */
export function reusableConversationLogoChoice(input: {
  readonly state: ServiceAiConversationState;
  readonly discovery: AuthoritativeLogoDiscoveryResult;
  readonly latestUserMessage: string;
  readonly vaultLogoChoice?: string;
}): string | undefined {
  const remembered = input.state.logoChoice;
  const assetId = remembered?.assetId?.trim();
  if (!assetId) return undefined;
  if (input.vaultLogoChoice?.trim()) return undefined;
  if (remembered?.brandId && remembered.brandId !== input.state.brandId) {
    return undefined;
  }
  if (input.discovery.attachmentLogoAssetIds.length > 0) return undefined;
  if (isLogoChangeRequest(input.latestUserMessage)) return undefined;
  if (
    jobCreatesNewLogo({
      brief: input.latestUserMessage,
      service: input.state.service,
      subtype: input.state.subtype,
    })
  ) {
    return undefined;
  }
  return input.discovery.vaultCandidates.some((c) => c.assetId === assetId)
    ? assetId
    : undefined;
}

/** Vault + attachment discovery with the conversation's remembered choice applied. */
export async function discoverConversationLogoInputs(input: {
  readonly organizationId: string;
  readonly state: ServiceAiConversationState;
  readonly latestUserMessage: string;
  readonly vaultLogoChoice?: string;
  readonly attachmentLogoAssetIds?: readonly string[];
}): Promise<AuthoritativeLogoDiscoveryResult> {
  const discovery = await discoverAuthoritativeLogoInputs({
    organizationId: input.organizationId,
    brandId: input.state.brandId,
    vaultLogoChoice: input.vaultLogoChoice,
    attachmentLogoAssetIds: input.attachmentLogoAssetIds,
    brief: input.latestUserMessage,
    service: input.state.service,
    subtype: input.state.subtype,
  });
  const remembered = reusableConversationLogoChoice({
    state: input.state,
    discovery,
    latestUserMessage: input.latestUserMessage,
    vaultLogoChoice: input.vaultLogoChoice,
  });
  return remembered
    ? Object.freeze({ ...discovery, vaultLogoChoice: remembered })
    : discovery;
}

/**
 * State patch after a turn: remember a logo the user picked (button, typed
 * follow-up, or attachment), and forget it when they ask to choose again.
 * A brand's only vault logo is not a choice, so it is not remembered.
 */
export function conversationLogoChoicePatch(input: {
  readonly state: ServiceAiConversationState;
  readonly discovery: AuthoritativeLogoDiscoveryResult;
  readonly latestUserMessage: string;
  readonly vaultLogoChoice?: string;
  readonly resolvedLogo?: AuthoritativeLogoSpec;
}): Pick<ServiceAiConversationState, "logoChoice"> | undefined {
  const resolved = input.resolvedLogo;
  if (resolved?.mode === "USE_EXISTING" && resolved.assetId?.trim()) {
    const assetId = resolved.assetId.trim();
    const wasChosen =
      Boolean(input.vaultLogoChoice?.trim()) ||
      input.discovery.attachmentLogoAssetIds.length > 0 ||
      input.discovery.vaultCandidates.length > 1;
    if (!wasChosen || input.state.logoChoice?.assetId === assetId) {
      return undefined;
    }
    return {
      logoChoice: {
        assetId,
        ...(input.state.brandId ? { brandId: input.state.brandId } : {}),
      },
    };
  }
  if (input.state.logoChoice && isLogoChangeRequest(input.latestUserMessage)) {
    return { logoChoice: undefined };
  }
  return undefined;
}
