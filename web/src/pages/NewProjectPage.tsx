import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function NewProjectPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [bookText, setBookText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBookText(String(ev.target?.result ?? ''));
      setFileName(file.name);
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !bookText.trim()) {
      setError('Give the project a title and provide the book text (paste or upload).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.createProject(title.trim(), bookText);
      navigate(`/projects/${res.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  }

  return (
    <div className="app-body narrow">
      <Link to="/projects" className="back-link">
        ← Back to projects
      </Link>
      <h3 style={{ fontSize: 20 }}>Start a new illustration project</h3>
      <p className="meta" style={{ marginBottom: 20 }}>
        Give it a title, then paste the book&rsquo;s text or upload a .txt file.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="gd-field">
          <label htmlFor="f-title">
            Project title <span className="req">*</span>
          </label>
          <input
            id="f-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Wind in the Willows — cottage-core"
          />
        </div>
        <div className="gd-field" style={{ marginTop: 16 }}>
          <label htmlFor="book-textarea">
            Book text <span className="req">*</span>
          </label>
          <button
            type="button"
            className={`dropzone ${fileName ? 'has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grad-ink)' }}>
              {fileName ? `✓ ${fileName} loaded` : 'Click to choose a .txt file'}
            </div>
            <div className="hint">Plain text only · used once as context for every step below</div>
          </button>
          <input ref={fileInputRef} type="file" accept=".txt" style={{ display: 'none' }} onChange={handleFile} />
          <div className="divider-or">or paste text</div>
          <textarea
            id="book-textarea"
            rows={8}
            value={bookText}
            onChange={(e) => {
              setBookText(e.target.value);
              setFileName(null);
            }}
            placeholder="Once upon a time, in a small burrow by the river..."
          />
        </div>
        {error && (
          <div className="gd-field err" role="alert">
            {error}
          </div>
        )}
        <button
          className="gd-btn gd-btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
          disabled={submitting}
          type="submit"
        >
          {submitting ? (
            'Creating…'
          ) : (
            <>
              Create project <span className="gd-arrow">→</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
