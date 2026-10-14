"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatNotice } from "@/components/ui/chat-notice";

/** Mirrors AI_PAUSE_COOLDOWN_MS in src/lib/ai/process.ts. */
const AI_PAUSE_COOLDOWN_MS = 10 * 60_000;

/**
 * Shown on the dashboard while the AI circuit breaker is open
 * (merchant_settings.ai_status = 'paused'), counting down to the
 * half-open probe.
 */
export function AIPausedNotice({ pausedAt }: { pausedAt: string | null }) {
  const router = useRouter();
  const resetAt = pausedAt
    ? new Date(pausedAt).getTime() + AI_PAUSE_COOLDOWN_MS
    : undefined;
  const [cooled, setCooled] = useState(
    () => resetAt !== undefined && resetAt <= Date.now()
  );

  return (
    <ChatNotice
      kind="rate-limit"
      title={cooled ? "AI replies resume on the next message" : "AI replies are paused"}
      description={
        cooled
          ? "The cooldown is over. Mo'een will try the AI again when a customer writes."
          : resetAt === undefined
            ? "Paused after repeated provider failures."
            : undefined
      }
      resetAt={resetAt}
      onReset={() => {
        setCooled(true);
        router.refresh();
      }}
    />
  );
}
