import type { ProjectDetail, ProjectSummary, StepKey, User } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (name: string, email: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ name, email }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me'),

  listProjects: () => request<{ projects: ProjectSummary[] }>('/projects'),
  createProject: (title: string, bookText: string) =>
    request<{ project: ProjectDetail }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ title, bookText }),
    }),
  getProject: (id: string) => request<{ project: ProjectDetail }>(`/projects/${id}`),
  runStep: (id: string, step: StepKey, userStyle?: string) =>
    request<{ project: ProjectDetail }>(`/projects/${id}/steps/${step}/run`, {
      method: 'POST',
      body: JSON.stringify({ userStyle }),
    }),

  fileUrl: (projectId: string, kind: 'portraits' | 'chapters', index: number) =>
    `${API_BASE}/files/${projectId}/${kind}/${index}`,
};
