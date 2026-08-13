import { createBrowserClient } from "@supabase/ssr";
import { firebaseAuth } from "./firebase";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseKey,
  {
    accessToken: async () => {
      const user = firebaseAuth.currentUser;

      if (!user) {
        return null;
      }

      return await user.getIdToken();
    },
  }
);