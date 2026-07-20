/**
 * Abstract specialized engines — override per provider.
 */

import { success, type Result } from "../../../shared/result";
import type { TemplateCanonicalRequest } from "../contracts/request-response";
import type { TemplateWirePayload } from "../contracts/wire";
import type {
  IProviderAssistantEngine,
  IProviderAudioEngine,
  IProviderEmbeddingEngine,
  IProviderFunctionCallingEngine,
  IProviderImageEngine,
  IProviderModerationEngine,
  IProviderReasoningEngine,
  IProviderToolEngine,
  IProviderVideoEngine,
  IProviderVisionEngine,
} from "../interfaces/provider-template";

export abstract class AbstractReasoningEngine implements IProviderReasoningEngine {
  supportsReasoning(_modelId: string): Result<boolean> {
    return success(false);
  }
  configureReasoning(request: TemplateCanonicalRequest): Result<TemplateCanonicalRequest> {
    return success(request);
  }
}

export abstract class AbstractVisionEngine implements IProviderVisionEngine {
  supportsVision(_modelId: string): Result<boolean> {
    return success(false);
  }
  prepareVisionInput(request: TemplateCanonicalRequest): Result<TemplateCanonicalRequest> {
    return success(request);
  }
}

export abstract class AbstractImageEngine implements IProviderImageEngine {
  supportsImageGeneration(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapImageRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractVideoEngine implements IProviderVideoEngine {
  supportsVideoGeneration(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapVideoRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractAudioEngine implements IProviderAudioEngine {
  supportsAudioInput(_modelId: string): Result<boolean> {
    return success(false);
  }
  supportsAudioOutput(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapAudioRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractEmbeddingEngine implements IProviderEmbeddingEngine {
  supportsEmbeddings(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapEmbeddingRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractModerationEngine implements IProviderModerationEngine {
  supportsModeration(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapModerationRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractFunctionCallingEngine implements IProviderFunctionCallingEngine {
  supportsFunctionCalling(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapFunctionCallRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractToolEngine implements IProviderToolEngine {
  supportsTools(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapToolRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}

export abstract class AbstractAssistantEngine implements IProviderAssistantEngine {
  supportsAssistants(_modelId: string): Result<boolean> {
    return success(false);
  }
  mapAssistantRequest(_request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({});
  }
}
