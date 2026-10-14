// Mo'een adaptation: physical spacing/position utilities switched to logical (RTL-safe) ones.
// Hairline UI · drop-zone · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import { File as FileIcon, FileImage, FileText, RotateCcw, X } from 'lucide-react';
import type { DropZoneFile } from './drop-zone-types';
import { formatBytes } from './drop-zone-utils';
import { DropZoneStatusMark } from './drop-zone-status';
import { NumberRoll } from './number-roll';
import { TextMorph } from './text-morph';
import { INTERACTION_FOCUS } from './ui-interaction-motion';

const action = `flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${INTERACTION_FOCUS}`;

export function DropZoneFileRow({ row, disabled, onRemove, onRetry }: {
  row: DropZoneFile; disabled: boolean; onRemove: () => void; onRetry: () => void;
}) {
  const { file, status, progress, error } = row;
  const Icon = file.type.startsWith('image/') ? FileImage : file.type === 'application/pdf' || file.type.startsWith('text/') ? FileText : FileIcon;
  const uploading = status === 'uploading';
  const errorId = `${row.id}-error`;

  return (
    <li className={`relative min-w-0 border-b ${status === 'error' ? 'border-destructive' : 'border-border'}`} aria-describedby={error ? errorId : undefined}>
      <div className="flex h-11 min-w-0 items-center gap-2 sm:gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2.5 text-[13px]">
          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate" title={file.name}>{file.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-muted-foreground">
          <span className={`whitespace-nowrap ${status === 'error' ? 'text-red-600 dark:text-red-400' : ''}`}>
            {status === 'error' ? <TextMorph>Failed</TextMorph> : (
              <>
                {formatBytes(file.size)}
                {uploading && <span className="ms-1"><span aria-hidden="true">· </span><NumberRoll value={Math.floor(progress * 100)} suffix="%" duration={400} /></span>}
              </>
            )}
          </span>
          <DropZoneStatusMark status={status} progress={progress} />
          <span className="sr-only">{status === 'done' ? 'Uploaded' : status === 'ready' ? 'Ready' : uploading ? 'Uploading' : 'Upload failed'}</span>
          {status === 'error' && (
            <button type="button" aria-label={`Retry upload of ${file.name}`} title="Retry upload" disabled={disabled} onClick={onRetry} className={action}>
              <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button type="button" aria-label={`${uploading ? 'Cancel upload of' : 'Remove'} ${file.name}`} title={uploading ? 'Cancel upload' : 'Remove file'} disabled={disabled} onClick={onRemove} className={action}>
            <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </span>
      </div>
      {error && <p id={errorId} className="pb-2.5 ps-[26px] pe-1 text-[11.5px] leading-relaxed text-red-600 [overflow-wrap:anywhere] dark:text-red-400">{error}</p>}
      {uploading && (
        <span role="progressbar" aria-label={`Upload progress for ${file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)} className="pointer-events-none absolute inset-x-0 -bottom-px h-px">
          <span className="block h-full origin-left bg-primary transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${progress})` }} />
        </span>
      )}
    </li>
  );
}
