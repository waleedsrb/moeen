"use client";

import { useEffect, useState } from "react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";

/**
 * How long after a customer message we keep showing "reading". The pipeline
 * waits out an 8s burst window before calling Gemini, so a real reply lands
 * well inside this; past it the AI either chose not to reply or is down, and
 * a spinner would be lying.
 */
const MAX_WAIT_MS = 90_000;

/**
 * Violet "AI is reading" row under the latest customer message while the
 * pipeline hasn't marked it processed yet. Violet because it is AI activity.
 */
export function AIThinkingRow({ createdAt }: { createdAt: string }) {
  const startedAt = new Date(createdAt).getTime();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const left = startedAt + MAX_WAIT_MS - Date.now();
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  if (expired) return null;

  return (
    <div className="mt-2 flex justify-start ps-1 text-ai">
      <ThinkingIndicator variant="dots" label="AI is reading" />
    </div>
  );
}
