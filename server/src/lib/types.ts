export const STEP_KEYS = [
  'STYLE',
  'CHARACTERS',
  'PORTRAITS',
  'CHAPTERS',
  'ILLUSTRATIONS',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export const STATUS_AFTER_STEP: Record<StepKey, ProjectStatus> = {
  STYLE: 'STYLE_SET',
  CHARACTERS: 'CHARACTERS_GENERATED',
  PORTRAITS: 'PORTRAITS_GENERATED',
  CHAPTERS: 'CHAPTERS_GENERATED',
  ILLUSTRATIONS: 'DONE',
};

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

/** The step a project is currently sitting at; undefined once DONE. */
export function currentStep(status: ProjectStatus): StepKey | undefined {
  return STEP_KEYS[statusIndex(status)];
}

export type StepState = 'IDLE' | 'RUNNING' | 'FAILED';

export const MAX_CHARACTERS = 2;
export const MAX_CHAPTERS = 1;

export interface Character {
  name: string;
  prompt: string;
  portraitStatus: 'pending' | 'generating' | 'done';
  portraitPath: string | null;
  imageInteractionId: string | null;
}

export interface Chapter {
  name: string;
  prompt: string;
  characterNames: string[];
  illustrationStatus: 'pending' | 'generating' | 'done';
  illustrationPath: string | null;
}

export interface Project {
  id: string;
  userEmail: string;
  title: string;
  createdAt: string;
  bookTextPath: string;
  status: ProjectStatus;
  stepState: StepState;
  stepStartedAt: string | null;
  lastError: string | null;
  style: string | null;
  rootInteractionId: string | null;
  charactersInteractionId: string | null;
  chaptersInteractionId: string | null;
  characters: Character[];
  chapters: Chapter[];
}

export interface User {
  email: string;
  name: string;
  createdAt: string;
}
