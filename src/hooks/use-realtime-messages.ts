"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/message";

export function useRealtimeMessages(
  conversationId: string | null,
  onNewMessage: (message: Message) => void,
  /** Row updates, e.g. the AI pipeline flipping ai_processed. */
  onMessageUpdate?: (message: Message) => void
) {
  const cbRef = useRef(onNewMessage);
  const updateRef = useRef(onMessageUpdate);
  useEffect(() => {
    cbRef.current = onNewMessage;
    updateRef.current = onMessageUpdate;
  });

  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as Message;
          if (message) {
            cbRef.current(message);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as Message;
          if (message) {
            updateRef.current?.(message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);
}
