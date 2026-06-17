import { create } from 'zustand'

import type {
  LaunchGroupDefinition,
  ServiceRuntime,
  ServiceWithRuntime,
} from '@/types/service'
import type { OperationHistoryItem, PortInspectionItem } from '@/types/runtime'
import type { AppSettings } from '@/types/settings'

interface ServiceStoreState {
  services: ServiceWithRuntime[]
  launchGroups: LaunchGroupDefinition[]
  ports: PortInspectionItem[]
  history: OperationHistoryItem[]
  settings: AppSettings | null
  loading: boolean
  setServices: (services: ServiceWithRuntime[]) => void
  upsertService: (service: ServiceWithRuntime) => void
  updateRuntime: (runtime: ServiceRuntime) => void
  setLaunchGroups: (launchGroups: LaunchGroupDefinition[]) => void
  setPorts: (ports: PortInspectionItem[]) => void
  setHistory: (history: OperationHistoryItem[]) => void
  setSettings: (settings: AppSettings) => void
  setLoading: (loading: boolean) => void
}

export const useServiceStore = create<ServiceStoreState>((set) => ({
  services: [],
  launchGroups: [],
  ports: [],
  history: [],
  settings: null,
  loading: false,
  setServices: (services) => set({ services }),
  upsertService: (service) =>
    set((state) => {
      const index = state.services.findIndex((item) => item.service.id === service.service.id)

      if (index === -1) {
        return { services: [...state.services, service] }
      }

      const nextServices = [...state.services]
      nextServices[index] = service
      return { services: nextServices }
    }),
  updateRuntime: (runtime) =>
    set((state) => ({
      services: state.services.map((item) =>
        item.service.id === runtime.serviceId ? { ...item, runtime } : item,
      ),
    })),
  setLaunchGroups: (launchGroups) => set({ launchGroups }),
  setPorts: (ports) => set({ ports }),
  setHistory: (history) => set({ history }),
  setSettings: (settings) => set({ settings }),
  setLoading: (loading) => set({ loading }),
}))
