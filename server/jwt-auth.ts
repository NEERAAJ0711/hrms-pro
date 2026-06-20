import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { storage } from "./storage";

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail closed by default: the ephemeral fallback is ONLY allowed when NODE_ENV is
  // explicitly a non-production env. If NODE_ENV is unset/misconfigured (a common
  // production mistake), we refuse to start rather than silently using a throwaway
  // secret. The real secret is supplied via the environment in production (the VPS).
  const isDevLike =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (!isDevLike) {
    throw new Error(
      "JWT_SECRET environment variable is required and is not set. " +
      "Refusing to start with an insecure hardcoded fallback. " +
      "Set JWT_SECRET to a long random string before starting the server.",
    );
  }
  // Development/test only: generate an ephemeral secret so the dev server can boot
  // without a configured secret. Tokens are NOT valid across restarts.
  JWT_SECRET = randomBytes(48).toString("hex");
  console.warn(
    "[jwt-auth] JWT_SECRET not set — using an ephemeral development secret. " +
    "Mobile tokens will be invalidated on every restart. Set JWT_SECRET for production.",
  );
}
const JWT_EXPIRES_IN = "7d";
const JWT_REFRESH_EXPIRES_IN = "30d";

interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  companyId: string | null;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export const requireJwtAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Provide Bearer token." });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await storage.getUser(payload.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  (req as any).user = user;
  next();
};
