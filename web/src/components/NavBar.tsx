import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="gd-nav">
      <div className="gd-nav-inner">
        <Link to="/projects" className="gd-nav-logo">
          <span className="mark" />
          Book Illustration Studio
        </Link>
        <div className="gd-nav-user">
          <div className="gd-nav-avatar">{initials}</div>
          {user.name}
          <button onClick={() => logout()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
