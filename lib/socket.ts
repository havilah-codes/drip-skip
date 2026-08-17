import { io, type Socket } from "socket.io-client";
import { firebaseAuth } from "@/lib/firebase";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

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

export async function connectSocket() {
  await setSocketAuthToken(false);

  if (!socket.connected) {
    socket.connect();
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