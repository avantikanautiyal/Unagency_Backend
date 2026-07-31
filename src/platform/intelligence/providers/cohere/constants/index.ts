/**
 * Cohere provider constants.
 */

export const COHERE_PROVIDER_ID = "provider.cohere";
export const COHERE_ADAPTER_ID = "adapter.cohere.text";
export const COHERE_SDK_CLIENT_ID = "sdk.cohere.text";
export const COHERE_PROVIDER_VERSION = "1.0.0";
export const COHERE_BASE_URL = "https://api.cohere.com/v2";
export const COHERE_CREDENTIAL_ENV = "COHERE_API_KEY";
export const COHERE_ENABLE_ENV = "COHERE_ENABLED";
export const COHERE_VENDOR = "cohere" as const;

export const COHERE_SEED_MODELS = ["command-r-plus", "embed-english-v3.0"] as const;
export const COHERE_EMBEDDING_MODELS = ["embed-english-v3.0"] as const;
