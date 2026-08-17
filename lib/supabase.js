import { createBrowserClient } from "@supabase/ssr";
import { firebaseAuth } from "./firebase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
  accessToken: async () => {
    const user = firebaseAuth.currentUser;

    if (!user) {
      console.log("🔐 SUPABASE TOKEN: No Firebase user");
      return null;
    }

    try {
      const token = await user.getIdToken();
      const payload = JSON.parse(atob(token.split(".")[1]));

      console.log("🔐 FIREBASE JWT CLAIMS:", {
        iss: payload.iss,
        aud: payload.aud,
        sub: payload.sub,
        role: payload.role,
        exp: payload.exp,
      });

      return token;
    } catch (error) {
      console.error("❌ COULD NOT INSPECT FIREBASE JWT:", error);
      return null;
    }
  },
});