/**
 * ProtectedRoute — Smart Grid Optimization
 *
 * Wrapper component that:
 *   - Shows a loading spinner while auth state is being determined
 *   - Redirects to /login if user is not authenticated
 *   - Renders children if authenticated
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading" id="auth-loading">
        <div className="auth-spinner" />
        <p className="auth-loading__text">Initializing secure session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
