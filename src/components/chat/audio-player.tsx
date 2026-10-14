"use client";

import { useMemo } from "react";
import { VoiceNote } from "@/components/ui/voice-note";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  /** Drives the accent color — violet only for AI (color = meaning). */
  tone?: "customer" | "merchant" | "ai";
}

const BAR_COUNT = 64;

/**
 * Deterministic pseudo-waveform derived from the URL, shown when the clip
 * can't be decoded in the browser (Instagram's CDN blocks cross-origin reads).
 */
function waveformBars(src: string): number[] {
  let seed = 0;
  for (let i = 0; i < src.length; i++) {
    seed = (seed * 31 + src.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    // Bias toward the middle so it reads like a voice envelope (0.35–1.0).
    bars.push(0.35 + ((seed % 1000) / 1000) * 0.65);
  }
  return bars;
}

// VoiceNote paints its play button and progress dot with --primary, so the
// tone just re-points that variable for this player.
const ACCENT: Record<NonNullable<AudioPlayerProps["tone"]>, string> = {
  customer: "[--primary:var(--color-status-incoming)] [--primary-foreground:#fff]",
  merchant: "",
  ai: "[--primary:var(--color-ai)] [--primary-foreground:#fff]",
};

export function AudioPlayer({ src, tone = "customer" }: AudioPlayerProps) {
  const fallback = useMemo(() => waveformBars(src), [src]);

  return (
    <VoiceNote
      src={src}
      label="Voice message"
      fallbackPeaks={fallback}
      className={cn("min-w-56 max-w-72 bg-transparent", ACCENT[tone])}
    />
  );
}
