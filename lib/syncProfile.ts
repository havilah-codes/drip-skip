import { User } from "firebase/auth";
import { supabase } from "@/lib/supabase";

export async function syncProfile(user: User) {
  console.log("🔥 SYNC PROFILE STARTED");
  console.log("🔥 FIREBASE UID:", user.uid);

  const username =
    user.email
      ?.split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9_.]/g, "")
      .slice(0, 30) ||
    `user_${user.uid.slice(0, 8)}`;

  const displayName =
    user.displayName ||
    user.email?.split("@")[0] ||
    "Drip User";

  const avatarUrl = user.photoURL || "/default-avatar.png";

  const {
    data: existingProfile,
    error: lookupError,
  } = await supabase
    .from("profiles")
    .select("*")
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  console.log("🔥 PROFILE LOOKUP:", {
    existingProfile,
    lookupError,
  });

  if (lookupError) {
    console.error(
      "❌ PROFILE LOOKUP ERROR:",
      JSON.stringify(lookupError, null, 2)
    );

    throw lookupError;
  }

  if (existingProfile) {
    console.log("✅ PROFILE ALREADY EXISTS:", existingProfile);
    return existingProfile;
  }

  console.log("🆕 PROFILE DOES NOT EXIST — CREATING...");

  const profileToInsert = {
    firebase_uid: user.uid,
    username,
    display_name: displayName,
    avatar_url: avatarUrl,
  };

  console.log(
    "🔥 PROFILE TO INSERT:",
    JSON.stringify(profileToInsert, null, 2)
  );

  const {
    data: newProfile,
    error: insertError,
  } = await supabase
    .from("profiles")
    .insert(profileToInsert)
    .select("*")
    .single();

  console.log("🔥 INSERT RESULT:", {
    newProfile,
    insertError,
  });

  if (insertError) {
    console.error(
      "❌ PROFILE CREATION ERROR:",
      JSON.stringify(insertError, null, 2)
    );

    console.error("❌ ERROR CODE:", insertError.code);
    console.error("❌ ERROR MESSAGE:", insertError.message);
    console.error("❌ ERROR DETAILS:", insertError.details);
    console.error("❌ ERROR HINT:", insertError.hint);

    throw insertError;
  }

  console.log(
    "✅ PROFILE CREATED SUCCESSFULLY:",
    newProfile
  );

  return newProfile;
}