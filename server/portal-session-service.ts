import { db } from "./db";
import { portalSessions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const secret = process.env.SESSION_ENCRYPTION_KEY ?? "hrms-portal-session-default-key-32b!";
  // Derive exactly 32 bytes from the key (pad/truncate)
  const buf = Buffer.alloc(32);
  Buffer.from(secret).copy(buf);
  return buf;
}

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(cipherText: string): string {
  const [ivHex, encHex] = cipherText.split(":");
  if (!ivHex || !encHex) throw new Error("Invalid cipher text format");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export interface PortalCredentials {
  username: string;
  password: string;
}

export interface PortalSessionData {
  id: string;
  companyId: string;
  portal: string;
  username: string;
  lastLoginAt?: string | null;
  sessionValidUntil?: string | null;
  isActive: boolean;
  hasCookies: boolean;
}

export class PortalSessionService {
  async saveCredentials(
    companyId: string,
    portal: "epfo" | "esic",
    username: string,
    password: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const encPwd = encrypt(password);

    // Upsert: if a session already exists for this company+portal, update it
    const existing = await db
      .select()
      .from(portalSessions)
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(portalSessions)
        .set({ username, encryptedPassword: encPwd, isActive: true, updatedAt: now })
        .where(eq(portalSessions.id, existing[0].id));
    } else {
      await db.insert(portalSessions).values({
        id: randomUUID(),
        companyId,
        portal,
        username,
        encryptedPassword: encPwd,
        encryptedCookies: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async getCredentials(
    companyId: string,
    portal: "epfo" | "esic"
  ): Promise<PortalCredentials | null> {
    const rows = await db
      .select()
      .from(portalSessions)
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal), eq(portalSessions.isActive, true)))
      .limit(1);

    if (!rows[0]) return null;
    try {
      return {
        username: rows[0].username,
        password: decrypt(rows[0].encryptedPassword),
      };
    } catch {
      return null;
    }
  }

  async saveCookies(
    companyId: string,
    portal: "epfo" | "esic",
    cookies: object[],
    validUntil?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const encCookies = encrypt(JSON.stringify(cookies));
    await db
      .update(portalSessions)
      .set({
        encryptedCookies: encCookies,
        lastLoginAt: now,
        sessionValidUntil: validUntil ?? null,
        updatedAt: now,
      })
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal)));
  }

  async getCookies(companyId: string, portal: "epfo" | "esic"): Promise<object[] | null> {
    const rows = await db
      .select()
      .from(portalSessions)
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal), eq(portalSessions.isActive, true)))
      .limit(1);

    if (!rows[0]?.encryptedCookies) return null;

    // Check if session is still valid
    if (rows[0].sessionValidUntil && new Date(rows[0].sessionValidUntil) < new Date()) {
      return null; // Session expired
    }

    try {
      return JSON.parse(decrypt(rows[0].encryptedCookies));
    } catch {
      return null;
    }
  }

  async clearCookies(companyId: string, portal: "epfo" | "esic"): Promise<void> {
    await db
      .update(portalSessions)
      .set({ encryptedCookies: null, sessionValidUntil: null, updatedAt: new Date().toISOString() })
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal)));
  }

  async getSessionInfo(companyId: string, portal: "epfo" | "esic"): Promise<PortalSessionData | null> {
    const rows = await db
      .select()
      .from(portalSessions)
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal)))
      .limit(1);

    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      companyId: rows[0].companyId,
      portal: rows[0].portal,
      username: rows[0].username,
      lastLoginAt: rows[0].lastLoginAt,
      sessionValidUntil: rows[0].sessionValidUntil,
      isActive: rows[0].isActive,
      hasCookies: !!rows[0].encryptedCookies,
    };
  }

  async listSessionsForCompany(companyId: string): Promise<PortalSessionData[]> {
    const rows = await db
      .select()
      .from(portalSessions)
      .where(eq(portalSessions.companyId, companyId));
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      portal: r.portal,
      username: r.username,
      lastLoginAt: r.lastLoginAt,
      sessionValidUntil: r.sessionValidUntil,
      isActive: r.isActive,
      hasCookies: !!r.encryptedCookies,
    }));
  }

  async deactivateSession(companyId: string, portal: "epfo" | "esic"): Promise<void> {
    await db
      .update(portalSessions)
      .set({ isActive: false, encryptedCookies: null, updatedAt: new Date().toISOString() })
      .where(and(eq(portalSessions.companyId, companyId), eq(portalSessions.portal, portal)));
  }
}

export const portalSessionService = new PortalSessionService();
