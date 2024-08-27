import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
export async function ErrorHandler(
  error: ApiError | Error,
  request: Request,
  response: Response,
  next: NextFunction
) {
  error instanceof ApiError
    ? response
        .status(error.statusCode)
        .json(new ApiResponse(error.statusCode, error.error, error.message))
    : response.status(500).json(new ApiResponse(500, null, error.message));
}
