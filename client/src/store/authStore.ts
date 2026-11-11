import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  
  // Actions
  login: (user: User, token: string) => void;
  logout: () => void;
  /** Swap in a renewed token for the current session. No-op when signed out. */
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user: User, token: string) => {
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },

      // Guarded so a renewed token arriving after logout can't resurrect the session.
      setToken: (token: string) => {
        set(state => (state.isAuthenticated ? { token } : {}));
      },
    }),
    {
      name: 'memex-auth',
    }
  )
);
