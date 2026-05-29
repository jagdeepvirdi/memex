import { create } from 'zustand';
import type { VaultKey } from '../lib/crypto';

interface VaultState {
  isLocked: boolean;
  vaultKey: VaultKey | null;
  lastActivity: number;
  
  // Actions
  unlock: (key: VaultKey) => void;
  lock: () => void;
  updateActivity: () => void;
  checkAutoLock: () => void;
}

const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export const useVaultStore = create<VaultState>()((set, get) => ({
  isLocked: true,
  vaultKey: null,
  lastActivity: Date.now(),

  unlock: (key: VaultKey) => {
    set({ 
      isLocked: false, 
      vaultKey: key, 
      lastActivity: Date.now() 
    });
  },

  lock: () => {
    set({ 
      isLocked: true, 
      vaultKey: null 
    });
  },

  updateActivity: () => {
    set({ lastActivity: Date.now() });
  },

  checkAutoLock: () => {
    const { isLocked, lastActivity, lock } = get();
    if (!isLocked && Date.now() - lastActivity > AUTO_LOCK_TIMEOUT) {
      lock();
    }
  }
}));
