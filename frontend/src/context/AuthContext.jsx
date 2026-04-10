/**
 * AuthContext — Smart Grid Optimization
 *
 * Provides authentication state and helpers to the entire app.
 * Manages httpOnly cookie-based JWT sessions:
 *   - Checks existing session on mount via GET /api/auth/me
 *   - Provides login(), logout() functions
 *   - Provides authFetch() that auto-handles 401 → refresh → retry
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const isRefreshing = useRef(false);

  // Check if there's an existing valid session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed');
    }

    const data = await res.json();
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even if the API call fails, clear local state
    }
    setUser(null);
    navigate('/login');
  }, [navigate]);

  /**
   * Wrapper around fetch that:
   *   1. Always includes credentials (cookies)
   *   2. On 401, attempts a silent token refresh and retries once
   *   3. If refresh also fails, logs out and redirects to /login
   */
  const authFetch = useCallback(async (url, options = {}) => {
    const opts = { ...options, credentials: 'include' };

    let res = await fetch(url, opts);

    if (res.status === 401 && !isRefreshing.current) {
      isRefreshing.current = true;
      try {
        const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (refreshRes.ok) {
          // Retry original request
          res = await fetch(url, opts);
          if (res.status === 401) {
            // Refresh worked but still 401 — force logout
            await logout();
          }
        } else {
          // Refresh failed — session expired
          await logout();
        }
      } catch {
        await logout();
      } finally {
        isRefreshing.current = false;
      }
    }

    return res;
  }, [logout]);

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    authFetch,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
