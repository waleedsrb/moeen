// Hairline UI · drop-zone · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

import type { DropZoneRejection } from './drop-zone-types';

export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  const unit = bytes < 1e6 ? 'KB' : bytes < 1e9 ? 'MB' : 'GB';
  const value = bytes / (unit === 'KB' ? 1000 : unit === 'MB' ? 1e6 : 1e9);
  return `${Number(value.toFixed(1))} ${unit}`;
}

export const acceptRules = (accept = '') => accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean);

export function acceptsFile(file: File, rules: string[]) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return !rules.length || rules.some((rule) =>
    rule.startsWith('.') ? name.endsWith(rule)
      : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule,
  );
}

export const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.type === b.type && a.lastModified === b.lastModified;

export function selectionHint(accept?: string, maxSize?: number, maxFiles?: number) {
  const types = acceptRules(accept).map((rule) =>
    rule.startsWith('.') ? rule.slice(1).toUpperCase()
      : rule.endsWith('/*') ? `${rule.slice(0, -2)} files` : rule.split('/').pop(),
  ).join(', ');
  return [types || 'Any file type', maxSize === undefined ? '' : `Up to ${formatBytes(maxSize)} per file`,
    maxFiles === undefined ? '' : `${maxFiles} file${maxFiles === 1 ? '' : 's'} maximum`].filter(Boolean).join(' · ');
}

/** Validate a whole batch before replacing a single-file selection. */
export function selectFiles(files: File[], current: File[], options: {
  accept?: string; maxSize?: number; maxFiles?: number; multiple?: boolean;
}) {
  const { maxSize, maxFiles, multiple = true } = options;
  const rules = acceptRules(options.accept);
  const limit = maxFiles === undefined ? Infinity : Math.max(0, Math.floor(maxFiles));
  const room = multiple ? Math.max(0, limit - current.length) : Math.min(1, limit);
  const accepted: File[] = [];
  const rejected: DropZoneRejection[] = [];
  for (const file of files) {
    let problem: Omit<DropZoneRejection, 'file'> | undefined;
    if (!acceptsFile(file, rules)) problem = { code: 'type', reason: 'This file type is not supported.' };
    else if (maxSize !== undefined && file.size > maxSize) problem = { code: 'size', reason: `Exceeds the ${formatBytes(maxSize)} limit.` };
    else if ([...current, ...accepted].some((other) => sameFile(file, other))) problem = { code: 'duplicate', reason: 'This file has already been added.' };
    else if (accepted.length >= room) problem = { code: 'count', reason: multiple ? `You can add up to ${maxFiles} files.` : 'Choose one file at a time.' };
    if (problem) rejected.push({ file, ...problem });
    else accepted.push(file);
  }
  return { accepted, rejected };
}
