import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { env } from "../../config/env";

export interface AuthPayload {
  sub: string;
  email?: string;
  name?: string;
  aud?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const supabaseUrl = env.SUPABASE_URL;
const jwksClient = new JwksClient({
  jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
});

async function verifyWithJwks(token: string): Promise<AuthPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header?.kid) {
    throw new Error("No kid in token header");
  }
  const key = await jwksClient.getSigningKey(decoded.header.kid);
  const publicKey = key.getPublicKey();
  return jwt.verify(token, publicKey, { algorithms: ["ES256"] }) as AuthPayload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } });
  }

  const token = header.slice(7);

  try {
    const payload = await verifyWithJwks(token);
    if (!payload.sub) {
      return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token payload" } });
    }
    req.user = payload;
    next();
  } catch {
    try {
      const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET, {
        algorithms: ["HS256"],
      }) as AuthPayload;
      if (!payload.sub) {
        return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token payload" } });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
    }
  }
}
