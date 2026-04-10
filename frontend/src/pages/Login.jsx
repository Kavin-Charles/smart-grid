/**
 * Login Page — Smart Grid Optimization
 *
 * Full-screen login form matching the dark glassmorphism design system.
 * Operator-only system — no registration link.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page" id="login-page">
      {/* Ambient background effects */}
      <div className="login-page__ambient" />

      <form className="login-card glass-card" onSubmit={handleSubmit} id="login-form">
        {/* Logo & Title */}
        <div className="login-card__header">
          <div className="login-card__logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h1 className="login-card__title">Smart Grid</h1>
          <p className="login-card__subtitle">Operator Authentication</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="login-card__error" id="login-error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Email Input */}
        <div className="login-field">
          <label htmlFor="login-email" className="login-field__label">Email</label>
          <div className="login-field__input-wrapper">
            <svg className="login-field__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M22 7l-10 7L2 7"/>
            </svg>
            <input
              id="login-email"
              type="email"
              className="login-field__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@smartgrid.local"
              required
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        {/* Password Input */}
        <div className="login-field">
          <label htmlFor="login-password" className="login-field__label">Password</label>
          <div className="login-field__input-wrapper">
            <svg className="login-field__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="login-field__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              minLength={8}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="login-field__toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              id="password-toggle"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="login-btn"
          disabled={isLoading}
          id="login-submit"
        >
          {isLoading ? (
            <div className="login-btn__loading">
              <div className="login-btn__spinner" />
              <span>Authenticating…</span>
            </div>
          ) : (
            <span>Sign In</span>
          )}
        </button>

        <p className="login-card__footer">
          Authorized operator access only
        </p>
      </form>
    </div>
  );
}
