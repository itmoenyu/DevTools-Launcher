import { create } from 'zustand'

interface AppStoreState {
  selectedServiceId: string | null
  activeLogServiceId: string | null
  setSelectedServiceId: (serviceId: string | null) => void
  setActiveLogServiceId: (serviceId: string | null) => void
}

export const useAppStore = create<AppStoreState>((set) => ({
  selectedServiceId: null,
  activeLogServiceId: null,
  setSelectedServiceId: (selectedServiceId) => set({ selectedServiceId }),
  setActiveLogServiceId: (activeLogServiceId) => set({ activeLogServiceId }),
}))
