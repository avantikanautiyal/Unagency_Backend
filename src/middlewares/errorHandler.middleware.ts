import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";

const SERVER_ERROR_MESSAGE =
  "Something went wrong on our end. Please try again in a moment.";
const STORAGE_ERROR_MESSAGE =
  "We couldn't save your changes right now. Please try again in a little while.";

/** Infrastructure / runtime details that must never reach a client. */
const INTERNAL_ERROR_PATTERN =
  /mongo|mongoose|E11000|space quota|writes are blocked|ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|Cast to \w+ failed|BSON|TypeError|ReferenceError|SyntaxError|Cannot read propert|is not a function|undefined is not|Unexpected token|https?:\/\/cloud\.mongodb/i;
const STORAGE_ERROR_PATTERN = /space quota|writes are blocked/i;

export async function ErrorHandler(
  error: ApiError | Error,
  request: Request,
  response: Response,
  next: NextFunction
) {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const rawMessage = error?.message ?? "";

  if (STORAGE_ERROR_PATTERN.test(rawMessage)) {
    console.error("[ErrorHandler] storage write blocked:", request.method, request.originalUrl, rawMessage);
    return response.status(503).json(new ApiResponse(503, null, STORAGE_ERROR_MESSAGE));
  }

  if (statusCode >= 500 || INTERNAL_ERROR_PATTERN.test(rawMessage)) {
    console.error("[ErrorHandler]", request.method, request.originalUrl, error);
    const safeStatus = statusCode >= 500 ? statusCode : 500;
    return response.status(safeStatus).json(new ApiResponse(safeStatus, null, SERVER_ERROR_MESSAGE));
  }

  return response
    .status(statusCode)
    .json(new ApiResponse(statusCode, null, rawMessage));
}
