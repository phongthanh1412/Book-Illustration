import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !email.includes('@')) {
      setError('Enter your name and a valid email to continue.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(name.trim(), email.trim());
      navigate('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="logo-row">
          <span className="mark" />
        </div>
        <h3 style={{ textAlign: 'center', fontSize: 20 }}>Book Illustration Studio</h3>
        <p className="lede">Enter your details to start or resume an illustration project.</p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="gd-field">
            <label htmlFor="f-name">
              Full name <span className="req">*</span>
            </label>
            <input
              id="f-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mira Hassan"
              autoComplete="name"
            />
          </div>
          <div className="gd-field">
            <label htmlFor="f-email">
              Email <span className="req">*</span>
            </label>
            <input
              id="f-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mira@example.com"
              autoComplete="email"
            />
          </div>
          {error && (
            <div className="gd-field err" role="alert">
              {error}
            </div>
          )}
          <button className="gd-btn gd-btn-primary" type="submit" disabled={submitting}>
            {submitting ? (
              'Signing in…'
            ) : (
              <>
                Continue <span className="gd-arrow">→</span>
              </>
            )}
          </button>
        </form>
        <p className="meta" style={{ textAlign: 'center', marginTop: 14 }}>
          No password — this is a lightweight identity check. Using an email that already has projects resumes
          them exactly where you left off.
        </p>
      </div>
    </div>
  );
}
