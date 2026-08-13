export const STEP_KEYS = ['STYLE', 'CHARACTERS', 'PORTRAITS', 'CHAPTERS', 'ILLUSTRATIONS'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type ProjectStatus =
  | 'CREATED'
  | 'STYLE_SET'
  | 'CHARACTERS_GENERATED'
  | 'PORTRAITS_GENERATED'
  | 'CHAPTERS_GENERATED'
  | 'DONE';

export const STATUS_ORDER: ProjectStatus[] = [
  'CREATED',
  'STYLE_SET',
  'CHARACTERS_GENERATED',
  'PORTRAITS_GENERATED',
  'CHAPTERS_GENERATED',
  'DONE',
];
export function statusIndex(status: ProjectStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export type StepState = 'IDLE' | 'RUNNING' | 'FAILED';

export interface Character {
  name: string;
  prompt: string;
  portraitStatus: 'pending' | 'generating' | 'done';
  portraitPath: string | null;
}

export interface Chapter {
  name: string;
  prompt: string;
  characterNames: string[];
  illustrationStatus: 'pending' | 'generating' | 'done';
  illustrationPath: string | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  status: ProjectStatus;
  stepState: StepState;
  stuck: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  bookText: string;
  style: string | null;
  lastError: string | null;
  currentStep: StepKey | null;
  characters: Character[];
  chapters: Chapter[];
}

export interface User {
  email: string;
  name: string;
}
