/**
 * Verified sync audio provider specs — LIVE only when vendorApiVerified=true.
 * Suno/Udio/PlayAI/Sesame/Stability remain catalogued but blocked (no verified public API).
 */

import type { IVendorAudioProtocol } from "../common/vendor-audio-protocol";
import { ElevenLabsAudioProtocol } from "../elevenlabs/elevenlabs-audio-protocol";
import { CartesiaAudioProtocol } from "../cartesia/cartesia-audio-protocol";

export interface VerifiedAudioProviderSpec {
  readonly canonicalProviderId: string;
  readonly vendor: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly liveSmokeEnvVar: string;
  readonly vendorApiVerified: boolean;
  readonly blockedReason?: string;
  readonly inventoryModelId: string;
  readonly wireModelId: string;
  readonly defaultVoiceId: string;
  readonly supportsTts: boolean;
  readonly supportsStt: boolean;
  readonly vendorStreamingSupported: boolean;
  readonly unagencyStreamingActivated: boolean;
  readonly createProtocol: () => IVendorAudioProtocol;
}

export const ELEVENLABS_AUDIO_SPEC: VerifiedAudioProviderSpec = {
  canonicalProviderId: "provider.elevenlabs",
  vendor: "elevenlabs",
  displayName: "ElevenLabs",
  baseUrl: "https://api.elevenlabs.io",
  credentialEnvVar: "ELEVENLABS_API_KEY",
  enableEnvVar: "ELEVENLABS_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_ELEVENLABS_AUDIO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "eleven-turbo-v2-5",
  wireModelId: "eleven_turbo_v2_5",
  defaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
  supportsTts: true,
  supportsStt: false,
  vendorStreamingSupported: true,
  unagencyStreamingActivated: false,
  createProtocol: () => new ElevenLabsAudioProtocol(),
};

export const CARTESIA_AUDIO_SPEC: VerifiedAudioProviderSpec = {
  canonicalProviderId: "provider.cartesia",
  vendor: "cartesia",
  displayName: "Cartesia",
  baseUrl: "https://api.cartesia.ai",
  credentialEnvVar: "CARTESIA_API_KEY",
  enableEnvVar: "CARTESIA_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_CARTESIA_AUDIO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "sonic-2",
  wireModelId: "sonic-2",
  defaultVoiceId: "794f9389-aac1-45b6-b726-9d9369183238",
  supportsTts: true,
  supportsStt: false,
  vendorStreamingSupported: true,
  unagencyStreamingActivated: false,
  createProtocol: () => new CartesiaAudioProtocol(),
};

/** Catalogued but not LIVE-executable — API contract unverified or no public API. */
export const BLOCKED_AUDIO_PROVIDER_SPECS: readonly VerifiedAudioProviderSpec[] = [
  {
    canonicalProviderId: "provider.playai",
    vendor: "playai",
    displayName: "PlayAI",
    baseUrl: "https://api.play.ai",
    credentialEnvVar: "PLAYAI_API_KEY",
    enableEnvVar: "PLAYAI_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_PLAYAI_AUDIO_SMOKE",
    vendorApiVerified: false,
    blockedReason: "API_CONTRACT_UNVERIFIED",
    inventoryModelId: "playdialog",
    wireModelId: "playdialog",
    defaultVoiceId: "",
    supportsTts: true,
    supportsStt: false,
    vendorStreamingSupported: false,
    unagencyStreamingActivated: false,
    createProtocol: () => {
      throw new Error("PlayAI not executable");
    },
  },
  {
    canonicalProviderId: "provider.sesame",
    vendor: "sesame",
    displayName: "Sesame",
    baseUrl: "https://api.sesame.com",
    credentialEnvVar: "SESAME_API_KEY",
    enableEnvVar: "SESAME_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_SESAME_AUDIO_SMOKE",
    vendorApiVerified: false,
    blockedReason: "API_CONTRACT_UNVERIFIED",
    inventoryModelId: "sesame-csm",
    wireModelId: "csm",
    defaultVoiceId: "",
    supportsTts: true,
    supportsStt: false,
    vendorStreamingSupported: false,
    unagencyStreamingActivated: false,
    createProtocol: () => {
      throw new Error("Sesame not executable");
    },
  },
  {
    canonicalProviderId: "provider.suno",
    vendor: "suno",
    displayName: "Suno",
    baseUrl: "https://api.suno.ai",
    credentialEnvVar: "SUNO_API_KEY",
    enableEnvVar: "SUNO_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_SUNO_AUDIO_SMOKE",
    vendorApiVerified: false,
    blockedReason: "NO_VERIFIED_FIRST_PARTY_API",
    inventoryModelId: "suno-v4",
    wireModelId: "suno-v4",
    defaultVoiceId: "",
    supportsTts: false,
    supportsStt: false,
    vendorStreamingSupported: false,
    unagencyStreamingActivated: false,
    createProtocol: () => {
      throw new Error("Suno not executable");
    },
  },
  {
    canonicalProviderId: "provider.udio",
    vendor: "udio",
    displayName: "Udio",
    baseUrl: "https://api.udio.com",
    credentialEnvVar: "UDIO_API_KEY",
    enableEnvVar: "UDIO_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_UDIO_AUDIO_SMOKE",
    vendorApiVerified: false,
    blockedReason: "NO_VERIFIED_FIRST_PARTY_API",
    inventoryModelId: "udio",
    wireModelId: "udio",
    defaultVoiceId: "",
    supportsTts: false,
    supportsStt: false,
    vendorStreamingSupported: false,
    unagencyStreamingActivated: false,
    createProtocol: () => {
      throw new Error("Udio not executable");
    },
  },
  {
    canonicalProviderId: "provider.stability",
    vendor: "stability",
    displayName: "Stability AI",
    baseUrl: "https://api.stability.ai",
    credentialEnvVar: "STABILITY_API_KEY",
    enableEnvVar: "STABILITY_AUDIO_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_STABILITY_AUDIO_SMOKE",
    vendorApiVerified: false,
    blockedReason: "STABLE_AUDIO_TEXT_TO_AUDIO_UNVERIFIED_ON_API_STABILITY_AI",
    inventoryModelId: "stable-audio-2",
    wireModelId: "stable-audio-2",
    defaultVoiceId: "",
    supportsTts: false,
    supportsStt: false,
    vendorStreamingSupported: false,
    unagencyStreamingActivated: false,
    createProtocol: () => {
      throw new Error("Stability audio not executable");
    },
  },
];

export const VERIFIED_AUDIO_PROVIDER_SPECS: readonly VerifiedAudioProviderSpec[] = [
  ELEVENLABS_AUDIO_SPEC,
  CARTESIA_AUDIO_SPEC,
];

export const ALL_AUDIO_PROVIDER_SPECS: readonly VerifiedAudioProviderSpec[] = [
  ...VERIFIED_AUDIO_PROVIDER_SPECS,
  ...BLOCKED_AUDIO_PROVIDER_SPECS,
];
