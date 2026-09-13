import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let cachedApp: App | null = null;

function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Server auth is not configured: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in this environment."
    );
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
  return getAuth(getAdminApp()).verifyIdToken(idToken);
}

/** Extract and verify the Bearer token from a Request. Returns null if absent/invalid. */
export async function getVerifiedUser(request: Request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) return null;

  try {
    return await verifyIdToken(token);
  } catch (error) {
    // Surface configuration problems in the server log while still
    // rejecting the request.
    if (error instanceof Error && error.message.startsWith("Server auth is not configured")) {
      console.error("UPLOAD AUTH CONFIG ERROR:", error.message);
    }
    return null;
  }
}
