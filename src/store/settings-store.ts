import { create } from 'zustand'

import type { AppSettings } from '@/types/settings'

interface SettingsStoreState {
  settings: AppSettings | null
  setSettings: (settings: AppSettings) => void
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}))
