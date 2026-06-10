"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  userId: string;
  email: string;
  username: string;
  globalRole: string;
  emailVerified: boolean;
}

interface AuthState {
  accessToken: string | null;
  expiresAt: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, expiresAt: string, user: AuthUser) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      expiresAt: null,
      user: null,
      setSession: (accessToken, expiresAt, user) =>
        set({ accessToken, expiresAt, user }),
      clearSession: () =>
        set({ accessToken: null, expiresAt: null, user: null }),
    }),
    { name: "alumni-auth" },
  ),
);

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
