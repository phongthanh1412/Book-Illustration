import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectDetailPage } from '../ProjectDetailPage';
import { api } from '../../lib/api';
import type { ProjectDetail } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  api: {
    getProject: vi.fn(),
    runStep: vi.fn(),
    fileUrl: vi.fn(() => '/fake.png'),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

function baseProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p1',
    title: 'The Wind in the Willows',
    createdAt: new Date().toISOString(),
    status: 'CREATED',
    stepState: 'IDLE',
    stuck: false,
    bookText: 'Once upon a time...',
    style: null,
    lastError: null,
    currentStep: 'STYLE',
    characters: [],
    chapters: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(api.getProject).mockReset();
  vi.mocked(api.runStep).mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectDetailPage', () => {
  it('names the currently running step instead of showing a bare spinner', async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      project: baseProject({ stepState: 'RUNNING', currentStep: 'CHARACTERS', status: 'STYLE_SET' }),
    });
    renderPage();

    expect(await screen.findByText(/generating the character list/i)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /generating/i })).toBeInTheDocument();
  });

  it('shows the failure and a same-step retry button, without touching completed steps', async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      project: baseProject({
        stepState: 'FAILED',
        lastError: 'Gemini API 500: internal error',
        currentStep: 'CHARACTERS',
        status: 'STYLE_SET',
      }),
    });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini API 500');
    const retryBtn = screen.getByRole('button', { name: /retry characters/i });

    vi.mocked(api.runStep).mockResolvedValue({
      project: baseProject({ stepState: 'IDLE', currentStep: 'PORTRAITS', status: 'CHARACTERS_GENERATED' }),
    });
    await userEvent.click(retryBtn);

    await waitFor(() => expect(api.runStep).toHaveBeenCalledWith('p1', 'CHARACTERS', undefined));
  });

  it('offers stuck-step recovery when a step was orphaned by a server restart', async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      project: baseProject({ stepState: 'RUNNING', stuck: true, currentStep: 'PORTRAITS', status: 'CHARACTERS_GENERATED' }),
    });
    renderPage();

    expect(await screen.findByText(/interrupted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry portraits/i })).toBeInTheDocument();
  });

  it('shows an empty-project loading state before data arrives, then the ready state', async () => {
    let resolve!: (v: { project: ProjectDetail }) => void;
    vi.mocked(api.getProject).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();

    expect(screen.getByText(/loading project/i)).toBeInTheDocument();
    resolve({ project: baseProject() });

    expect(await screen.findByText(/ready for the next step/i)).toBeInTheDocument();
  });
});
