/**
 * SessionManager — loads saved Playwright browser cookies from the
 * portal_sessions table (via PortalSessionService) and injects them into
 * a new BrowserContext so automation functions don't need to log in on
 * every job. After a successful login, cookies are extracted and persisted.
 */
import type { BrowserContext } from "playwright";
import { portalSessionService } from "../portal-session-service";

// Session cookies are considered valid for 8 hours after being saved
const SESSION_VALIDITY_HOURS = 8;

export type Portal = "epfo" | "esic";

/**
 * Portal login-page URL fragments — used to detect session expiry by
 * checking whether the current page URL contains a login marker.
 */
const LOGIN_URL_MARKERS: Record<Portal, string[]> = {
  epfo: ["login", "globalutilities-web/appId"],
  // Note: ESIC employer portal lives at portal.esic.gov.in/EmployerPortal/ESICInsurancePortal/
  // Any URL fragment that signals the login page (not a post-login dashboard page)
  esic: ["Portal_Loginnew.aspx", "LoginPage", "/EmployerPortal/Default"],
};

export class SessionManager {
  /**
   * Inject saved cookies into the context. Returns true if valid cookies
   * were found and injected, false if the session was missing or expired.
   */
  async restoreSession(
    companyId: string,
    portal: Portal,
    context: BrowserContext
  ): Promise<boolean> {
    try {
      const cookies = await portalSessionService.getCookies(companyId, portal);
      if (!cookies || cookies.length === 0) return false;
      await context.addCookies(cookies as Parameters<BrowserContext["addCookies"]>[0]);
      return true;
    } catch (err) {
      console.warn(`[SessionManager] restoreSession failed for ${portal}:`, err);
      return false;
    }
  }

  /**
   * Extract current cookies from the context and persist them encrypted.
   * Called after every successful login.
   */
  async saveSession(
    companyId: string,
    portal: Portal,
    context: BrowserContext,
    createdBy?: string
  ): Promise<void> {
    try {
      const cookies = await context.cookies();
      if (cookies.length === 0) return;
      const validUntil = new Date(
        Date.now() + SESSION_VALIDITY_HOURS * 60 * 60 * 1000
      ).toISOString();
      await portalSessionService.saveCookies(companyId, portal, cookies, validUntil);
    } catch (err) {
      console.warn(`[SessionManager] saveSession failed for ${portal}:`, err);
    }
  }

  /**
   * Returns true if the current page URL suggests the session has expired
   * and we've been redirected to a login page.
   */
  isLoginPage(currentUrl: string, portal: Portal): boolean {
    const markers = LOGIN_URL_MARKERS[portal];
    return markers.some((m) => currentUrl.toLowerCase().includes(m.toLowerCase()));
  }

  /** Clear persisted session (e.g. after a fatal auth failure) */
  async clearSession(companyId: string, portal: Portal): Promise<void> {
    await portalSessionService.clearCookies(companyId, portal);
  }
}

export const sessionManager = new SessionManager();
