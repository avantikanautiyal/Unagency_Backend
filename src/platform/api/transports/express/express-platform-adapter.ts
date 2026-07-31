/**
 * Express transport adapter for ApiGatewayEngine.
 * Express is transport only — all platform logic remains in ApiGatewayEngine.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { IApiGateway } from "../../interfaces";
import { toApiRequest } from "./express-request-adapter";
import { sendApiResponse } from "./express-response-adapter";
import { logTransportError, sendTransportError } from "./express-error-adapter";

export interface ExpressPlatformAdapterOptions {
  readonly gateway: IApiGateway;
}

export function createExpressPlatformAdapter(
  options: ExpressPlatformAdapterOptions
): RequestHandler {
  const { gateway } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiRequest = toApiRequest(req);
    if (!apiRequest) {
      next();
      return;
    }

    try {
      const result = await gateway.handle(apiRequest);
      if (!result.ok) {
        sendTransportError(res, result.error, apiRequest.requestId);
        return;
      }
      sendApiResponse(res, result.value);
    } catch (err) {
      logTransportError(req, err);
      sendTransportError(res, err, apiRequest.requestId);
    }
  };
}
