import { NextFunction, Response, Request } from "express";
import { ApiError } from "./apiError";
import { ApiResponse } from "./apiResponse";
type ControllerFunction = (
  request: Request,
  response: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = (fn: ControllerFunction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const controllerResponse = await fn(req, res, next) as ApiResponse;
      if (!controllerResponse) return;
      if (controllerResponse instanceof ApiResponse) {
        return res.status(controllerResponse.statusCode).json(controllerResponse)
      } else {
        throw new ApiError("Controller should return a ApiResponse type")
      }

    } catch (err: unknown) {
      next(
        new ApiError(
          (err as ApiError).message,
          (err as ApiError).statusCode || 500
        )
      );
    }
  };
};
