import { useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { securityRequest } from '../api/security';
import { onUnauthorized } from '../api/client';
import { createAdministrator } from '../api/setup';

import { AuthContext } from './authContextValue';

/**
 * Holds the signed-in user. The server is the source of truth: the role
 * shown here only decides which links are rendered.
 */
export function AuthProvider({ children, initialUser }) {
  const [user, setUser] = useState(initialUser === undefined ? null : initialUser);
  const [loading, setLoading] = useState(initialUser === undefined);

  useEffect(() => {
    onUnauthorized(() => setUser(null));
    if (initialUser !== undefined) return;
    let active = true;
    authApi
      .me()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [initialUser]);

  const login = useCallback(async (email, password) => {
    const u = await authApi.login(email, password);
    setUser(u.mfaRequired ? null : u);
    return u;
  }, []);

  const verifyMfa = useCallback(async (code) => {
    const u = await securityRequest('mfa/verify', { code });
    setUser(u);
    return u;
  }, []);
  const refreshProfile = useCallback(async () => { const u = await authApi.me(); setUser(u); }, []);

  const register = useCallback(async (name, email, password) => {
    const u = await authApi.register(name, email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const completeSetup = useCallback(async (token) => {
    const updatedUser = await createAdministrator(token);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const hasRole = useCallback((...roles) => Boolean(user && roles.includes(user.role)), [user]);

  const value = useMemo(() => ({ user, loading, login, register, logout, completeSetup, hasRole, verifyMfa, refreshProfile }), [user, loading, login, register, logout, completeSetup, hasRole, verifyMfa, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
