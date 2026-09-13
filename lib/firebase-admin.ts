import type { App } from "firebase-admin/app";

let cachedApp: App | null = null;

async function getAdminApp(): Promise<App> {
  if (cachedApp) return cachedApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Server auth is not configured: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in this environment."
    );
  }

  // Import lazily so bundling issues or missing env vars can't crash
  // route modules at load time.
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");

  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  cachedApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return cachedApp;
}

/**
 * Verify a Firebase ID token (e.g. from an Authorization: Bearer header).
 * Throws if the token is invalid or expired.
 */
export async function verifyIdToken(idToken: string) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await getAdminApp()).verifyIdToken(idToken);
}

/** Extract and verify the Bearer token from a Request.
 *
 * Returns null for a missing/invalid/expired token.
 * Throws a config error when the server's Firebase credentials are broken,
 * so callers can distinguish "bad user token" from "bad deployment".
 */
export async function getVerifiedUser(request: Request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) return null;

  try {
    return await verifyIdToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Broken server configuration — propagate so the route returns a 500
    // naming the problem instead of a misleading 401.
    if (message.startsWith("Server auth is not configured")) {
      console.error("UPLOAD AUTH CONFIG ERROR:", message);
      throw error;
    }

    // Real token problem — log the reason and reject.
    const code = (error as { code?: string })?.code || "unknown";
    console.error("TOKEN VERIFY FAILED:", code, message);
    return null;
  }
}
