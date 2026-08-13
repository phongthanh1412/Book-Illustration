import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProjectListPage } from '../ProjectListPage';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    listProjects: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(api.listProjects).mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectListPage />
    </MemoryRouter>,
  );
}

describe('ProjectListPage', () => {
  it('shows the empty state with a call to action when there are no projects', async () => {
    vi.mocked(api.listProjects).mockResolvedValue({ projects: [] });
    renderPage();

    expect(await screen.findByText('No projects yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new project/i }).length).toBeGreaterThan(0);
  });

  it('renders a status pill per project', async () => {
    vi.mocked(api.listProjects).mockResolvedValue({
      projects: [
        { id: '1', title: 'Draft book', createdAt: new Date().toISOString(), status: 'CREATED', stepState: 'IDLE', stuck: false },
        { id: '2', title: 'Finished book', createdAt: new Date().toISOString(), status: 'DONE', stepState: 'IDLE', stuck: false },
        { id: '3', title: 'Interrupted book', createdAt: new Date().toISOString(), status: 'CHARACTERS_GENERATED', stepState: 'RUNNING', stuck: true },
      ],
    });
    renderPage();

    expect(await screen.findByText('Draft book')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Interrupted')).toBeInTheDocument();
    expect(screen.getByText(/needs retry/i)).toBeInTheDocument();
  });

  it('shows a retry affordance when loading the list fails', async () => {
    vi.mocked(api.listProjects).mockRejectedValueOnce(new Error('network down'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');

    vi.mocked(api.listProjects).mockResolvedValueOnce({ projects: [] });
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('No projects yet.')).toBeInTheDocument());
  });
});
