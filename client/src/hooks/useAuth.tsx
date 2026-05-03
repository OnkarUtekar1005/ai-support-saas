import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { queryClient } from '../lib/queryClient';

interface AuthContextType {
  user: ReturnType<typeof useAuthStore>['user'];
  organization: ReturnType<typeof useAuthStore>['organization'];
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (orgName: string, email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, organization, token, setAuth, clearAuth, updateToken } = useAuthStore();
  const [loading, setLoading] = useState(!user); // skip loading if already hydrated from localStorage

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.getMe()
      .then((data: any) => {
        setAuth(data.user, data.organization, token);
      })
      .catch(async () => {
        // Access token expired — try refreshing
        try {
          const refreshed: any = await api.refreshToken();
          updateToken(refreshed.token);
          const data: any = await api.getMe();
          setAuth(data.user, data.organization, refreshed.token);
        } catch {
          clearAuth();
          queryClient.clear();
        }
      })
      .finally(() => setLoading(false));
  }, []); // run once on mount

  const login = useCallback(async (email: string, password: string) => {
    const data: any = await api.login({ email, password });
    setAuth(data.user, data.organization, data.token);
  }, [setAuth]);

  const register = useCallback(async (orgName: string, email: string, password: string, name: string) => {
    const data: any = await api.register({ orgName, email, password, name });
    setAuth(data.user, data.organization, data.token);
  }, [setAuth]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // server logout is best-effort
    }
    clearAuth();
    queryClient.clear();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{
      user, organization, token, loading, login, register, logout,
      isAdmin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
