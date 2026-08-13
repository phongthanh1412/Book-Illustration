import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { ProjectDetail, StepKey } from '../lib/types';
import { STEP_CAPTIONS, STEP_LABELS, snippet } from '../lib/projectDisplay';
import { Stepper } from '../components/Stepper';
import { EntityCard } from '../components/EntityCard';
import { BookTextModal } from '../components/BookTextModal';
import { ErrorBanner } from '../components/ErrorBanner';

const POLL_MS = 2000;

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [runError, setRunError] = useState('');
  const [styleInput, setStyleInput] = useState('');
  const [showBookModal, setShowBookModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getProject(id);
      setProject(res.project);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load project');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (project?.stepState === 'RUNNING' && !project.stuck) {
      pollRef.current = window.setInterval(load, POLL_MS);
    }
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [project?.stepState, project?.stuck, load]);

  async function runStep(step: StepKey, userStyle?: string) {
    if (!id) return;
    setSubmitting(true);
    setRunError('');
    try {
      const res = await api.runStep(id, step, userStyle);
      setProject(res.project);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // A second tab or a double-click already kicked this off — resync
        // instead of showing a scary error for something harmless.
        await load();
      } else {
        setRunError(err instanceof Error ? err.message : 'Failed to run step');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="app-body">
        <ErrorBanner message={loadError} onRetry={load} />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="app-body">
        <p className="meta">Loading project…</p>
      </div>
    );
  }

  const step = project.currentStep;
  const isRunning = project.stepState === 'RUNNING' && !project.stuck;
  const isFailed = project.stepState === 'FAILED';

  return (
    <div className="app-body">
      <Link to="/projects" className="back-link">
        ← Back to projects
      </Link>
      <h2 style={{ fontSize: 22, marginBottom: 4 }}>{project.title}</h2>
      <p className="meta" style={{ marginBottom: 24 }}>
        Created {new Date(project.createdAt).toLocaleDateString()}
      </p>
      <Stepper status={project.status} />
      <div className="detail-grid">
        <div>
          <StepPanel
            step={step}
            isRunning={isRunning}
            isFailed={isFailed}
            stuck={project.stuck}
            lastError={project.lastError}
            runError={runError}
            submitting={submitting}
            styleInput={styleInput}
            onStyleInputChange={setStyleInput}
            onRun={() => step && runStep(step, step === 'STYLE' ? styleInput : undefined)}
          />

          {project.chapters.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div className="panel-title">
                <h3>Chapters ({project.chapters.length})</h3>
              </div>
              <div className="entity-grid" style={{ gridTemplateColumns: '1fr', marginBottom: 28 }}>
                {project.chapters.map((c, i) => (
                  <EntityCard
                    key={i}
                    kind="chapter"
                    name={c.name}
                    prompt={c.prompt}
                    status={c.illustrationStatus}
                    imageUrl={c.illustrationPath ? api.fileUrl(project.id, 'chapters', i) : null}
                  />
                ))}
              </div>
            </div>
          )}

          {project.characters.length > 0 && (
            <div>
              <div className="panel-title">
                <h3>Characters ({project.characters.length})</h3>
              </div>
              <div className="entity-grid">
                {project.characters.map((c, i) => (
                  <EntityCard
                    key={i}
                    kind="character"
                    name={c.name}
                    prompt={c.prompt}
                    status={c.portraitStatus}
                    imageUrl={c.portraitPath ? api.fileUrl(project.id, 'portraits', i) : null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {project.style ? (
            <div className="side-note">
              <h5>Style</h5>
              <p>{project.style}</p>
              <button
                type="button"
                className="gd-btn gd-btn-ghost gd-btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setShowBookModal(true)}
              >
                Read full book text →
              </button>
            </div>
          ) : (
            <div className="side-note">
              <h5>Book text</h5>
              <p style={{ fontStyle: 'italic' }}>{snippet(project.bookText, 220)}</p>
              <button
                type="button"
                className="gd-btn gd-btn-ghost gd-btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setShowBookModal(true)}
              >
                Read full text →
              </button>
            </div>
          )}
        </div>
      </div>

      {showBookModal && <BookTextModal text={project.bookText} onClose={() => setShowBookModal(false)} />}
    </div>
  );
}

interface StepPanelProps {
  step: StepKey | null;
  isRunning: boolean;
  isFailed: boolean;
  stuck: boolean;
  lastError: string | null;
  runError: string;
  submitting: boolean;
  styleInput: string;
  onStyleInputChange: (v: string) => void;
  onRun: () => void;
}

function StepPanel({
  step,
  isRunning,
  isFailed,
  stuck,
  lastError,
  runError,
  submitting,
  styleInput,
  onStyleInputChange,
  onRun,
}: StepPanelProps) {
  if (!step) {
    return (
      <div className="step-panel">
        <div className="status-line" style={{ color: 'var(--grad-ink)' }}>
          <span className="gd-num-square done" style={{ width: 20, height: 20, fontSize: 11 }}>
            ✓
          </span>
          All 5 steps complete — nothing left to generate.
        </div>
        <p className="help">This project is done. Reopen it any time; nothing here regenerates automatically.</p>
      </div>
    );
  }

  if (stuck) {
    return (
      <div className="step-panel">
        <div className="status-line" style={{ color: 'var(--grad-ink)' }}>
          This step was interrupted (probably a server restart mid-request) and never finished.
        </div>
        <p className="help">
          Nothing before this step was affected — everything already generated is saved. Retrying is safe.
        </p>
        <button className="gd-btn gd-btn-secondary" style={{ marginTop: 14 }} onClick={onRun} disabled={submitting}>
          Retry {STEP_LABELS[step]}
        </button>
      </div>
    );
  }

  const showStyleField = step === 'STYLE' && !isRunning;

  return (
    <div className="step-panel">
      {isRunning ? (
        <div className="status-line">
          <span className="spinner" role="status" aria-label="Generating" /> {STEP_CAPTIONS[step]}…
        </div>
      ) : isFailed ? (
        <ErrorBanner message={lastError || 'Step failed'} />
      ) : (
        <div className="status-line" style={{ color: 'var(--grad-ink)' }}>
          Ready for the next step: <b>{STEP_LABELS[step]}</b>.
        </div>
      )}
      {runError && <ErrorBanner message={runError} />}
      {showStyleField && (
        <div className="gd-field" style={{ marginBottom: 14 }}>
          <label htmlFor="style-input">Art style (optional)</label>
          <input
            id="style-input"
            value={styleInput}
            onChange={(e) => onStyleInputChange(e.target.value)}
            placeholder="Leave blank to let Gemini choose a style based on your book"
          />
        </div>
      )}
      <p className="help">
        Reopening this page mid-step won&rsquo;t fire a second request — it just shows the same in-flight state
        until it lands.
      </p>
      <button
        className="gd-btn gd-btn-primary"
        style={{ marginTop: 14 }}
        disabled={isRunning || submitting}
        onClick={onRun}
      >
        {isRunning ? 'Generating…' : isFailed ? `Retry ${STEP_LABELS[step]}` : `Generate ${STEP_LABELS[step]}`}
        {!isRunning && <span className="gd-arrow">→</span>}
      </button>
    </div>
  );
}
