/**
 * Cap → matrix use-case → executable audio.synthesize leaf.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import {
  AUDIO_USE_CASE_PREFERENCES,
  pickFirstExecutablePref,
  resolveAudioCreativeUseCase,
  type AudioCreativeUseCase,
  type MatrixProviderPref,
} from "../../routing/matrix/matrix-use-case-routing";

export interface AudioRouteDecision {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly useCase: AudioCreativeUseCase;
  readonly label: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}

export class AudioExecutionRouter {
  constructor(private readonly registry: IProviderRuntimeRegistry) {}

  resolve(input: {
    prompt: string;
    capabilityId?: string;
    preferredProviderId?: string;
    preferredModelId?: string;
  }): Result<AudioRouteDecision> {
    const capabilityId = input.capabilityId?.trim() || "audio.synthesize";
    const executable = this.listExecutableAudioProviderIds();
    if (executable.length === 0) {
      return failure(
        new ValidationError(
          "No LIVE-executable audio provider — set ELEVENLABS_API_KEY, CARTESIA_API_KEY, or OPENAI_API_KEY"
        )
      );
    }

    const allowed = new Set(executable.map(String));
    const useCase = resolveAudioCreativeUseCase(input.prompt);
    const preferences = AUDIO_USE_CASE_PREFERENCES[useCase].filter((p) =>
      allowed.has(p.providerId)
    );

    let selected: MatrixProviderPref | undefined;
    if (input.preferredProviderId?.trim()) {
      const pref = input.preferredProviderId.trim();
      if (!allowed.has(pref)) {
        return failure(
          new ValidationError(
            `Preferred provider ${pref} is not LIVE-executable for audio.synthesize`
          )
        );
      }
      selected = {
        providerId: pref,
        modelId:
          input.preferredModelId?.trim() ||
          preferences.find((p) => p.providerId === pref)?.modelId ||
          "default",
        label: pref,
      };
    } else {
      selected = pickFirstExecutablePref(
        AUDIO_USE_CASE_PREFERENCES[useCase],
        allowed
      );
    }

    if (!selected) {
      return failure(
        new ValidationError("No audio.synthesize preference matched executable providers")
      );
    }

    const failoverChain: { providerId: string; modelId: string }[] = [];
    const seen = new Set<string>([`${selected.providerId}::${selected.modelId}`]);
    for (const step of preferences) {
      const key = `${step.providerId}::${step.modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failoverChain.push({ providerId: step.providerId, modelId: step.modelId });
    }

    return success({
      providerId: selected.providerId,
      modelId: selected.modelId,
      capabilityId,
      useCase,
      label: selected.label,
      failoverChain,
    });
  }

  private listExecutableAudioProviderIds(): readonly ProviderId[] {
    return this.registry.listAvailableProviderIds().filter((id) => {
      const entry = this.registry.resolveAvailable(id);
      if (!entry) return false;
      return (
        entry.capabilities.includes("audio.synthesize") ||
        entry.capabilities.includes("audio.transcribe")
      );
    });
  }
}

export function createAudioExecutionRouter(options: {
  registry: IProviderRuntimeRegistry;
}): AudioExecutionRouter {
  return new AudioExecutionRouter(options.registry);
}
