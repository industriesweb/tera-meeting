import { Request, Response, NextFunction } from "express";

export function wrapResponse(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (body && typeof body === "object" && "error" in body) {
      return originalJson(body);
    }
    return originalJson({ success: true, data: body });
  };
  next();
}
