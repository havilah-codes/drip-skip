import { jwtVerify, createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { createPublicKey } from "node:crypto";

/**
 * Firebase ID token verification WITHOUT firebase-admin.
 *
 * The admin SDK's jwks-rsa dependency crashes in Vercel's serverless runtime
 * (ERR_REQUIRE_ESM), so we verify signatures directly against Google's
 * x509 certificate set — the same checks the SDK performs
 * (signature, issuer, audience, expiry).
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

if (!PROJECT_ID) {
  console.error(
    "Server auth is not configured: FIREBASE_PROJECT_ID must be set in this environment."
  );
}

interface VerifiedToken {
  uid: string;
  email?: string;
}

// Cache the JWK set; Google rotates keys, so refresh periodically.
let cachedKey: JWTVerifyGetKey | null = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

async function getKey(): Promise<JWTVerifyGetKey> {
  if (cachedKey && Date.now() - cachedAt < CACHE_MS) return cachedKey;

  const res = await fetch(CERTS_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch Firebase signing certificates (${res.status})`);
  }

  const certs = (await res.json()) as Record<string, string>;

  const keys = Object.entries(certs).map(([kid, certPem]) => {
    const { n, e } = createPublicKey(certPem).export({ format: "jwk" }) as {
      n: string;
      e: string;
    };
    return { kty: "RSA", n, e, kid, alg: "RS256", use: "sig" };
  });

  cachedKey = createLocalJWKSet({ keys });
  cachedAt = Date.now();
  return cachedKey;
}

/**
 * Verify a Firebase ID token. Throws with a descriptive message if the
 * token is invalid, expired, or from the wrong project.
 */
export async function verifyIdToken(idToken: string) {
  if (!PROJECT_ID) {
    throw new Error(
      "Server auth is not configured: FIREBASE_PROJECT_ID must be set in this environment."
    );
  }

  const { payload } = await jwtVerify(idToken, await getKey(), {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });

  const uid = payload.sub;
  if (!uid) {
    throw new Error("Invalid token: missing subject claim.");
  }

  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : undefined,
    claims: payload,
  };
}

/** Extract and verify the Bearer token from a Request. Returns null if absent/invalid. */
export async function getVerifiedUser(request: Request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) return null;

  try {
    return await verifyIdToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.startsWith("Server auth is not configured")) {
      console.error("UPLOAD AUTH CONFIG ERROR:", message);
      throw error;
    }

    console.error("TOKEN VERIFY FAILED:", message);
    return null;
  }
}
