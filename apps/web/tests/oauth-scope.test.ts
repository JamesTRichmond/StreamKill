import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildGmailAuthUrl, GMAIL_READONLY } from "@/lib/google-oauth";

// Locks the least-privilege posture of the "Connect Gmail" OAuth request.
// If a future change broadens scope, requests offline access (a refresh token),
// or lets scopes creep, these tests fail — the privacy promise is enforced, not
// just documented.

const STATE = "csrf-state-123";
const REDIRECT = "https://app.streamkill.ai/api/gmail/callback";

// Google scopes that would be MORE than read-only — none may ever appear.
const OVER_PRIVILEGED = [
  "https://mail.google.com/", // full mailbox access
  "gmail.modify",
  "gmail.compose",
  "gmail.send",
  "gmail.insert",
  "gmail.labels",
  "gmail.settings",
];

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("Gmail connect OAuth — least privilege", () => {
  beforeAll(() => {
    process.env.AUTH_GOOGLE_ID = "test-client-id.apps.googleusercontent.com";
  });
  afterAll(() => {
    delete process.env.AUTH_GOOGLE_ID;
  });

  it("requests exactly openid + email + gmail.readonly, nothing more", () => {
    const p = params(buildGmailAuthUrl({ state: STATE, redirectUri: REDIRECT }));
    expect(p.get("scope")).toBe(`openid email ${GMAIL_READONLY}`);
    expect(GMAIL_READONLY).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("never requests an over-privileged Gmail scope", () => {
    const scope = params(buildGmailAuthUrl({ state: STATE, redirectUri: REDIRECT })).get("scope") ?? "";
    for (const bad of OVER_PRIVILEGED) {
      expect(scope.includes(bad)).toBe(false);
    }
  });

  it("uses online access — no refresh token, nothing long-lived to store", () => {
    const p = params(buildGmailAuthUrl({ state: STATE, redirectUri: REDIRECT }));
    expect(p.get("access_type")).toBe("online");
    expect(p.get("include_granted_scopes")).toBe("false");
  });

  it("forwards state (CSRF) and redirect_uri, and asks the user to pick an account", () => {
    const p = params(buildGmailAuthUrl({ state: STATE, redirectUri: REDIRECT }));
    expect(p.get("response_type")).toBe("code");
    expect(p.get("state")).toBe(STATE);
    expect(p.get("redirect_uri")).toBe(REDIRECT);
    expect(p.get("prompt") ?? "").toContain("select_account");
    expect(p.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
  });

  it("fails closed when the Google client id is not configured", () => {
    const saved = process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_ID;
    try {
      expect(() => buildGmailAuthUrl({ state: STATE, redirectUri: REDIRECT })).toThrow();
    } finally {
      process.env.AUTH_GOOGLE_ID = saved;
    }
  });
});
