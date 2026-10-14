// Hairline UI · drop-zone · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import type { DropZoneFile, DropZoneProps, DropZoneRejection } from './drop-zone-types';
import { selectFiles } from './drop-zone-utils';

type Options = Pick<DropZoneProps, 'accept' | 'maxSize' | 'maxFiles' | 'multiple' | 'disabled' | 'onUpload' | 'onFilesChange' | 'onFilesRejected'>;

export function useDropZone(options: Options) {
  const [rows, setRows] = React.useState<DropZoneFile[]>([]);
  const [rejections, setRejections] = React.useState<DropZoneRejection[]>([]);
  const [announcement, setAnnouncement] = React.useState('');
  const current = React.useRef(rows);
  const latest = React.useRef(options);
  latest.current = options;
  const controllers = React.useRef(new Map<string, AbortController>());
  const sequence = React.useRef(0);
  const prefix = React.useId();
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    const active = controllers.current;
    return () => { mounted.current = false; active.forEach((controller) => controller.abort()); active.clear(); };
  }, []);

  const commit = React.useCallback((next: DropZoneFile[]) => {
    current.current = next;
    if (mounted.current) setRows(next);
  }, []);

  const patch = React.useCallback((id: string, next: Partial<DropZoneFile>) => {
    if (mounted.current) commit(current.current.map((row) => row.id === id ? { ...row, ...next } : row));
  }, [commit]);

  const start = React.useCallback((id: string, file: File) => {
    const upload = latest.current.onUpload;
    if (!upload) { patch(id, { status: 'ready', progress: 0, error: undefined }); return; }
    controllers.current.get(id)?.abort();
    const controller = new AbortController();
    controllers.current.set(id, controller);
    patch(id, { status: 'uploading', progress: 0, error: undefined });
    const active = () => mounted.current && !controller.signal.aborted && controllers.current.get(id) === controller;
    let last = 0;
    Promise.resolve().then(() => {
      if (!active()) return;
      return upload(file, {
        signal: controller.signal,
        progress: (fraction) => {
          if (!active() || !Number.isFinite(fraction)) return;
          const value = Math.max(last, Math.min(1, Math.max(0, fraction)));
          if (value === last) return;
          last = value;
          patch(id, { progress: value });
        },
      });
    }).then(() => {
      if (!active()) return;
      patch(id, { status: 'done', progress: 1 });
      setAnnouncement(`${file.name} uploaded.`);
    }, (error: unknown) => {
      if (!active()) return;
      const message = error instanceof Error && error.message ? error.message : 'Upload failed. Please try again.';
      patch(id, { status: 'error', error: message });
      setAnnouncement(`${file.name}: ${message}`);
    }).finally(() => {
      if (controllers.current.get(id) === controller) controllers.current.delete(id);
    });
  }, [patch]);

  const add = React.useCallback((files: File[]) => {
    const settings = latest.current;
    if (settings.disabled || !files.length) return;
    const { accepted, rejected } = selectFiles(files, current.current.map((row) => row.file), settings);
    setRejections(rejected);
    if (accepted.length) {
      const added: DropZoneFile[] = accepted.map((file) => ({
        id: `${prefix}-${++sequence.current}`, file,
        status: settings.onUpload ? 'uploading' : 'ready', progress: 0,
      }));
      if (settings.multiple === false) {
        controllers.current.forEach((controller) => controller.abort());
        controllers.current.clear();
      }
      const next = [...(settings.multiple === false ? [] : current.current), ...added];
      commit(next);
      added.forEach((row) => start(row.id, row.file));
      settings.onFilesChange?.(next.map((row) => row.file));
    }
    setAnnouncement([
      accepted.length ? `Added ${accepted.map((file) => file.name).join(', ')}.` : '',
      rejected.length ? `${rejected.length} file${rejected.length === 1 ? '' : 's'} skipped. Check the file requirements.` : '',
    ].filter(Boolean).join(' '));
    if (rejected.length) settings.onFilesRejected?.(rejected);
  }, [commit, prefix, start]);

  const remove = React.useCallback((id: string) => {
    if (latest.current.disabled) return;
    const row = current.current.find((entry) => entry.id === id);
    if (!row) return;
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    const next = current.current.filter((entry) => entry.id !== id);
    commit(next);
    setAnnouncement(`${row.file.name} ${row.status === 'uploading' ? 'cancelled' : 'removed'}.`);
    latest.current.onFilesChange?.(next.map((entry) => entry.file));
  }, [commit]);

  const retry = React.useCallback((id: string) => {
    if (latest.current.disabled) return;
    const row = current.current.find((entry) => entry.id === id);
    if (row?.status === 'error') { start(id, row.file); setAnnouncement(`Retrying ${row.file.name}.`); }
  }, [start]);

  return { rows, rejections, announcement, add, remove, retry, dismissRejections: () => setRejections([]) };
}
