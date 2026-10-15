// Hairline UI · drop-zone · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

import type * as React from 'react';

export type DropZoneStatus = 'ready' | 'uploading' | 'done' | 'error';

export interface DropZoneFile {
  id: string;
  file: File;
  status: DropZoneStatus;
  /** A fraction from 0 to 1. */
  progress: number;
  error?: string;
}

export type DropZoneUpload = (
  file: File,
  context: { progress: (fraction: number) => void; signal: AbortSignal },
) => void | Promise<void>;

export interface DropZoneRejection {
  file: File;
  code: 'type' | 'size' | 'count' | 'duplicate';
  reason: string;
}

export interface DropZoneHandle {
  /** Tracks a drag from your app. Only coordinates inside the drop area return true. */
  drag: (clientX: number, clientY: number, types?: string[]) => boolean;
  cancel: () => void;
  /** Adds files from your app; optional coordinates must be inside the drop area. */
  drop: (files: File[], at?: { x: number; y: number }) => void;
  browse: () => void;
}

export interface DropZoneProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDrop' | 'title'> {
  /** Resolve when uploaded, throw to offer Retry, and honour the abort signal. */
  onUpload?: DropZoneUpload;
  /** Current selection after adding, replacing or removing files. */
  onFilesChange?: (files: File[]) => void;
  onFilesRejected?: (rejections: DropZoneRejection[]) => void;
  /** Native input syntax: MIME types, wildcards or extensions, e.g. "image/*,.pdf". */
  accept?: string;
  /** Maximum size of each file in bytes. */
  maxSize?: number;
  maxFiles?: number;
  /** false replaces the current file when a valid new file is selected. */
  multiple?: boolean;
  title?: string;
  hint?: string;
  disabled?: boolean;
  ref?: React.Ref<DropZoneHandle>;
}
