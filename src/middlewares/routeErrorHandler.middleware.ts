import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
export function RouteErrorHandler(req: Request, res: Response, next: NextFunction) {
    const error = new ApiError("Route not found", 404);
    res.status(404);
    next(error);
}