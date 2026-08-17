import { supabase } from "@/lib/supabase";

export async function getOrCreateChat(
  currentProfileId: string,
  otherProfileId: string
) {
  if (currentProfileId === otherProfileId) {
    throw new Error(
      "You cannot message yourself."
    );
  }

  // Find chats belonging to current user
  const { data: myChats, error: myChatsError } =
    await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", currentProfileId);

  if (myChatsError) {
    throw myChatsError;
  }

  const chatIds =
    myChats?.map(
      (chat) => chat.chat_id
    ) || [];

  // Check if a chat already exists
  if (chatIds.length > 0) {
    const { data: existingChat, error } =
      await supabase
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", otherProfileId)
        .in("chat_id", chatIds)
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (existingChat?.chat_id) {
      return existingChat.chat_id;
    }
  }

  // Create new chat
  const { data: chat, error: chatError } =
    await supabase
      .from("chats")
      .insert({})
      .select("id")
      .single();

  if (chatError || !chat) {
    throw (
      chatError ||
      new Error("Failed to create chat.")
    );
  }

  // Add both users
  const { error: participantsError } =
    await supabase
      .from("chat_participants")
      .insert([
        {
          chat_id: chat.id,
          user_id: currentProfileId,
        },
        {
          chat_id: chat.id,
          user_id: otherProfileId,
        },
      ]);

  if (participantsError) {
    throw participantsError;
  }

  return chat.id;
}