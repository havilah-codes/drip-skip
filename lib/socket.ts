import { io, type Socket } from "socket.io-client";
import { firebaseAuth } from "@/lib/firebase";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

// Refresh the token 5 minutes before expiry.
const TOKEN_REFRESH_MS = 55 * 60 * 1000;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,

  // Socket.IO handles transport reconnection.
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,

  transports: ["websocket"],
});

let refreshPromise: Promise<void> | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

async function setSocketAuthToken(
  forceRefresh = false
) {
  const user = firebaseAuth.currentUser;

  if (!user) {
    throw new Error("User is not authenticated");
  }

  const token = await user.getIdToken(forceRefresh);

  socket.auth = {
    token,
  };
}

function startTokenRefreshTimer() {
  stopTokenRefreshTimer();

  refreshInterval = setInterval(async () => {
    try {
      const user = firebaseAuth.currentUser;
      if (!user || !socket.connected) return;

      await setSocketAuthToken(true);
      console.log("🔄 SOCKET TOKEN REFRESHED");
    } catch (err) {
      console.error(
        "❌ AUTO TOKEN REFRESH FAILED:",
        err instanceof Error ? err.message : err
      );
    }
  }, TOKEN_REFRESH_MS);
}

function stopTokenRefreshTimer() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export async function connectSocket() {
  await setSocketAuthToken(false);

  if (!socket.connected) {
    socket.connect();
    startTokenRefreshTimer();
  }
}

export async function refreshSocketToken() {
  // Prevent multiple simultaneous token refreshes.
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    await setSocketAuthToken(true);

    if (socket.connected) {
      socket.disconnect();
    }

    socket.connect();
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Force the socket to reconnect with a fresh Firebase token.
 */
export async function reconnectSocket() {
  try {
    await refreshSocketToken();
    startTokenRefreshTimer();
  } catch (error) {
    console.error(
      "❌ SOCKET RECONNECT FAILED:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    throw error;
  }
}

/**
 * Listen for auth-related connect errors and
 * automatically refresh the token and reconnect.
 */
socket.on("connect_error", async (err) => {
  const msg = err?.message || "";

  if (
    msg.includes("id-token-expired") ||
    msg.includes("Authentication failed")
  ) {
    console.warn("⚠️ SOCKET AUTH ERROR — refreshing token...");

    try {
      await setSocketAuthToken(true);
      socket.disconnect();
      socket.connect();
      startTokenRefreshTimer();
    } catch (refreshErr) {
      console.error(
        "❌ AUTO RECONNECT FAILED:",
        refreshErr instanceof Error
          ? refreshErr.message
          : refreshErr
      );
    }
  }
});