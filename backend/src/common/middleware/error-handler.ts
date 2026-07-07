import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";
import { logger } from "../../config/logger";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const field = issue.path.length > 0 ? issue.path.join(".") : "_root";
      (fieldErrors[field] ??= []).push(issue.message);
    }
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((e) => e.message).join("; "),
        details: { fieldErrors },
      },
    });
  }

  logger.error("Unhandled error", err);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: err.message || "Internal server error", stack: err.stack },
  });
}
