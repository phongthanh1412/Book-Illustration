import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { ProjectSummary } from '../lib/types';
import { STEP_KEYS, statusIndex } from '../lib/types';
import { projectSubtitle } from '../lib/projectDisplay';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

export function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your projects');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="app-body">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  }
  if (!projects) {
    return (
      <div className="app-body">
        <p className="meta">Loading your projects…</p>
      </div>
    );
  }

  return (
    <div className="app-body">
      <div className="list-head">
        <h2>Your projects</h2>
        <Link to="/projects/new" className="gd-btn gd-btn-primary">
          + New project
        </Link>
      </div>
      {projects.length === 0 ? (
        <EmptyState
          message="No projects yet."
          action={
            <Link to="/projects/new" className="gd-btn gd-btn-primary">
              + New project
            </Link>
          }
        />
      ) : (
        <div className="project-list">
          {projects.map((p, i) => (
            <ProjectRow key={p.id} project={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project: p, index }: { project: ProjectSummary; index: number }) {
  const idx = statusIndex(p.status);
  return (
    <Link
      to={`/projects/${p.id}`}
      className="project-row"
      style={{ ['--stagger' as string]: `${index * 45}ms` } as React.CSSProperties}
    >
      <div className="title">
        <h4>{p.title}</h4>
        <span className="meta">
          Created {new Date(p.createdAt).toLocaleDateString()} ·{' '}
          {p.stuck ? 'Interrupted — needs retry' : projectSubtitle(p.status)}
        </span>
      </div>
      <div className="progress-mini">
        {STEP_KEYS.map((_, si) => (
          <span key={si} className={`seg ${si < idx ? 'on' : ''}`} />
        ))}
      </div>
      {p.stuck ? (
        <span className="gd-pill gray">Interrupted</span>
      ) : p.status === 'DONE' ? (
        <span className="gd-pill ink">Done</span>
      ) : p.status === 'CREATED' ? (
        <span className="gd-pill gray">Draft</span>
      ) : (
        <span className="gd-pill">
          <span className="dot" />
          In progress
        </span>
      )}
    </Link>
  );
}
