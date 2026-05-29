import { db } from "./db";
import { portalSessions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // 96-bit IV recommended for GCM
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY environment variable is required for portal session encryption. " +
      "Set a random 32-byte hex string in your environment secrets."
    );
  }
  if (secret.length < 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be at least 32 characters long.");
  }
  const buf = Buffer.alloc(32);
  Buffer.from(secret, "utf8").copy(buf);
  return buf;
}

function encrypt(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv) as ReturnType<typeof createCipheriv> & { getAuthTag(): Buffer };
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = (cipher as any).getAuthTag() as Buffer;
  // Format: iv_hex:tag_hex:ciphertext_hex
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(cipherText: string): string {
  const parts = cipherText.split(":");
  if (parts.length !== 3) throw new Error("Invalid cipher text format");
  const [ivHex, tagHex, encHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv) as ReturnType<typeof createDecipheriv> & { setAuthTag(tag: Buffer): void };
  (decipher as any).setAuthTag(tag);
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
