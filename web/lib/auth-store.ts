import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from './types';

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (s: { user: User; accessToken: string; refreshToken: string }) => void;
  setTokens: (t: { accessToken: string; refreshToken: string }) => void;
  setUser: (user: User) => void;
  clear: () => void;
};

// NOTE: tokens live in localStorage for now. Before production move the refresh token to an httpOnly cookie.
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: (s) => set(s),
      setTokens: (t) => set(t),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'bytechat-auth' },
  ),
);
