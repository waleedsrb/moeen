// Mo'een adaptation: physical spacing/position utilities switched to logical (RTL-safe) ones.
// Hairline UI · drop-zone · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import { CircleAlert } from 'lucide-react';
import type { DropZoneStatus } from './drop-zone-types';
import { interactionIcon, useInteractionReducedMotion } from './ui-interaction-motion';

/** The original row's progress ring and drawn check, without any flying-file effects. */
export function DropZoneStatusMark({ status, progress }: { status: DropZoneStatus; progress: number }) {
  const reduced = useInteractionReducedMotion();
  return (
    <span aria-hidden="true" className="relative ms-1 size-4 shrink-0">
      <svg viewBox="0 0 16 16" className="absolute inset-0 size-4 -rotate-90" style={interactionIcon(status === 'uploading', reduced)}>
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" pathLength={1}
          strokeDasharray="1" strokeDashoffset={1 - progress} style={{ transition: reduced ? 'none' : 'stroke-dashoffset 200ms ease-out' }} />
      </svg>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        className="absolute inset-0 size-4 text-primary" style={interactionIcon(status === 'done', reduced)}>
        <path d="M3.5 8.5l3 3 6-7" pathLength={1} strokeDasharray="1" strokeDashoffset={status === 'done' ? 0 : 1}
          style={{ transition: reduced ? 'none' : 'stroke-dashoffset 260ms ease-out' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-red-600 dark:text-red-400" style={interactionIcon(status === 'error', reduced)}>
        <CircleAlert className="size-4" strokeWidth={1.75} />
      </span>
    </span>
  );
}
