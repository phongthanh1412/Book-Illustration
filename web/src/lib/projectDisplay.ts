import { STEP_KEYS, statusIndex, type ProjectStatus } from './types';

export const STEP_LABELS: Record<(typeof STEP_KEYS)[number], string> = {
  STYLE: 'Style',
  CHARACTERS: 'Characters',
  PORTRAITS: 'Portraits',
  CHAPTERS: 'Chapters',
  ILLUSTRATIONS: 'Illustrations',
};

export const STEP_CAPTIONS: Record<(typeof STEP_KEYS)[number], string> = {
  STYLE: 'Reading your book text and defining an art style',
  CHARACTERS: "Generating the character list from your book's text",
  PORTRAITS: 'Generating character portraits',
  CHAPTERS: 'Generating a chapter illustration prompt',
  ILLUSTRATIONS: 'Generating the chapter illustration',
};

export function projectSubtitle(status: ProjectStatus): string {
  if (status === 'CREATED') return 'Book text saved · style not yet generated';
  if (status === 'DONE') return 'All 5 steps complete';
  const idx = statusIndex(status);
  return STEP_KEYS.slice(0, idx)
    .map((k) => STEP_LABELS[k])
    .join(' + ') + ' done';
}

export function snippet(text: string, n: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}
