// Hairline UI · drop-zone · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { ArrowUp, CircleAlert, X } from 'lucide-react';
import { DropZoneFileRow } from './drop-zone-file-row';
import type { DropZoneProps } from './drop-zone-types';
import { selectionHint } from './drop-zone-utils';
import { useDropZone } from './use-drop-zone';
import { TextMorph } from './text-morph';
import { INTERACTION_FOCUS } from './ui-interaction-motion';

export type { DropZoneStatus, DropZoneFile, DropZoneUpload, DropZoneRejection, DropZoneHandle, DropZoneProps } from './drop-zone-types';
export { formatBytes } from './drop-zone-utils';

const carriesFiles = (data: DataTransfer) => Array.from(data.types).includes('Files');

export function DropZone({
  onUpload, onFilesChange, onFilesRejected, accept, maxSize, maxFiles, multiple = true,
  title = 'Drop files here', hint, disabled = false, ref, className = '', onPaste, ...props
}: DropZoneProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const area = React.useRef<HTMLButtonElement>(null);
  const depth = React.useRef(0);
  const [dragging, setDragging] = React.useState(false);
  const id = React.useId();
  const { rows, rejections, announcement, add, remove, retry, dismissRejections } = useDropZone({
    onUpload, onFilesChange, onFilesRejected, accept, maxSize, maxFiles, multiple, disabled,
  });
  const description = hint ?? selectionHint(accept, maxSize, multiple ? maxFiles : 1);

  const cancel = React.useCallback(() => { depth.current = 0; setDragging(false); }, []);
  const browse = React.useCallback(() => { if (!disabled) input.current?.click(); }, [disabled]);
  const contains = React.useCallback((x: number, y: number) => {
    const rect = area.current?.getBoundingClientRect();
    return !!rect && rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  React.useEffect(() => { if (disabled) cancel(); }, [disabled, cancel]);
  React.useImperativeHandle(ref, () => ({
    browse, cancel,
    drag: (x, y) => {
      const inside = !disabled && contains(x, y);
      setDragging(inside);
      return inside;
    },
    drop: (files, at) => {
      cancel();
      if (!at || contains(at.x, at.y)) add(files);
    },
  }), [browse, cancel, disabled, contains, add]);

  return (
    <div
      {...props}
      className={`@container relative w-full min-w-0 text-foreground ${className}`}
      onPaste={(event) => {
        onPaste?.(event);
        if (event.defaultPrevented || disabled) return;
        const files = Array.from(event.clipboardData.files);
        if (files.length) { event.preventDefault(); cancel(); add(files); }
      }}
    >
      <button
        ref={area}
        type="button"
        disabled={disabled}
        onClick={browse}
        aria-label={`Browse ${multiple ? 'files' : 'file'}`}
        aria-describedby={`${id}-title ${id}-hint`}
        data-drop-zone=""
        data-dragging={dragging || undefined}
        aria-disabled={disabled || undefined}
        onDragEnter={(event) => {
          if (!carriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          if (!disabled) { depth.current++; setDragging(true); }
        }}
        onDragOver={(event) => {
          if (!carriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          cancel();
          add(Array.from(event.dataTransfer.files));
        }}
        onDragEnd={cancel}
        className={`relative flex min-h-[152px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-[18px] border px-5 py-5 text-center transition-colors duration-200 disabled:cursor-default disabled:opacity-55 motion-reduce:transition-none @md:min-h-[176px] ${INTERACTION_FOCUS} ${
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/45'
        }`}
      >
        <span className={`relative flex size-9 shrink-0 items-center justify-center rounded-full border bg-background transition-colors duration-200 motion-reduce:transition-none ${dragging ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}>
          <ArrowUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="relative flex max-w-full flex-col items-center gap-1">
          <span id={`${id}-title`} className="text-[13.5px] font-medium tracking-[-0.01em]">
            <TextMorph>{dragging ? 'Release to add' : title}</TextMorph>
          </span>
          <span id={`${id}-hint`} className="text-balance text-[12px] leading-relaxed text-muted-foreground">
            <span className="whitespace-nowrap"><span className="text-foreground underline decoration-border underline-offset-[3px]">Browse</span> or paste ·</span> {description}
          </span>
        </span>
      </button>
      <input
        ref={input} type="file" hidden disabled={disabled} multiple={multiple} accept={accept}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          cancel();
          add(files);
        }}
      />

      {rejections.length > 0 && (
        <div role="alert" className="mt-2 flex items-start gap-2 text-red-600 dark:text-red-400">
          <CircleAlert className="mt-2 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 py-1.5 text-[12px] leading-relaxed [overflow-wrap:anywhere]">
            {rejections.slice(0, 3).map((rejection, index) => (
              <p key={index} className="break-words"><span className="font-medium">{rejection.file.name}</span> — {rejection.reason}</p>
            ))}
            {rejections.length > 3 && <p className="mt-1">{rejections.length - 3} more files skipped.</p>}
          </div>
          <button type="button" aria-label="Dismiss file errors" onClick={dismissRejections} className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-muted ${INTERACTION_FOCUS}`}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <ul aria-label="Files" className="mt-3 min-w-0">
          {rows.map((row) => <DropZoneFileRow key={row.id} row={row} disabled={disabled} onRemove={() => remove(row.id)} onRetry={() => retry(row.id)} />)}
        </ul>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
    </div>
  );
}
