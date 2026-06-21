import { create } from 'zustand'

import type {
  LaunchGroupDefinition,
  ServiceRuntime,
  ServiceWithRuntime,
} from '@/types/service'
import type {
  OperationHistoryItem,
  PortInspectionItem,
  PortInspectorSummary,
} from '@/types/runtime'
import type { AppSettings } from '@/types/settings'

interface ServiceStoreState {
  services: ServiceWithRuntime[]
  launchGroups: LaunchGroupDefinition[]
  ports: PortInspectionItem[]
  summary: PortInspectorSummary
  isPaused: boolean
  pauseReason: 'manual' | 'tab-hidden' | null
  history: OperationHistoryItem[]
  settings: AppSettings | null
  loading: boolean
  setServices: (services: ServiceWithRuntime[]) => void
  upsertService: (service: ServiceWithRuntime) => void
  updateRuntime: (runtime: ServiceRuntime) => void
  setLaunchGroups: (launchGroups: LaunchGroupDefinition[]) => void
  /** 简单设置 ports，不算 diff（兼容旧调用方） */
  setPorts: (ports: PortInspectionItem[]) => void
  /** 全量刷新 ports 并计算 diff（用于新轮询） */
  replacePorts: (ports: PortInspectionItem[], scanDurationMs: number) => void
  setPaused: (paused: boolean, reason?: 'manual' | 'tab-hidden' | null) => void
  clearDiffs: () => void
  setHistory: (history: OperationHistoryItem[]) => void
  setSettings: (settings: AppSettings) => void
  setLoading: (loading: boolean) => void
}

const initialSummary: PortInspectorSummary = {
  total: 0,
  listening: 0,
  established: 0,
  conflict: 0,
  lastRefreshedAt: null,
  scanDurationMs: 0,
  isPaused: false,
  pauseReason: null,
}

export const useServiceStore = create<ServiceStoreState>((set, get) => ({
  services: [],
  launchGroups: [],
  ports: [],
  summary: initialSummary,
  isPaused: false,
  pauseReason: null,
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
  replacePorts: (ports, scanDurationMs) => {
    // 关键：用旧的 ports（之前可能含 diff=gone 的行）算 diff
    // 消失的端口保留在 ports 中 5 秒（由 clearDiffs 移除）
    const previous = get().ports
    const prevByPort = new Map(previous.map((p) => [p.port, p]))
    const newPortSet = new Set(ports.map((p) => p.port))

    // 1. 本轮扫描到的端口：标记 new / changed / null
    const currentMarked: PortInspectionItem[] = ports.map((curr) => {
      const prev = prevByPort.get(curr.port)
      if (!prev) return { ...curr, diff: 'new' as const }
      const changed =
        prev.pid !== curr.pid ||
        prev.processName !== curr.processName ||
        prev.localAddress !== curr.localAddress
      return { ...curr, diff: changed ? ('changed' as const) : null }
    })

    // 2. 上一轮有、本轮没有：标 gone（保留 5 秒）
    const goneItems: PortInspectionItem[] = previous
      .filter((p) => !newPortSet.has(p.port) && p.diff !== 'gone')
      .map((p) => ({ ...p, diff: 'gone' as const }))

    // 3. 上一轮已是 gone 且仍未恢复：保持 gone（不重复触发）
    const stillGone: PortInspectionItem[] = previous
      .filter((p) => !newPortSet.has(p.port) && p.diff === 'gone')

    const diffed = [...currentMarked, ...goneItems, ...stillGone]

    const summary: PortInspectorSummary = {
      ...get().summary,
      total: diffed.filter((p) => p.diff !== 'gone').length,
      listening: diffed.filter((p) => p.state === 'LISTENING' && p.diff !== 'gone').length,
      established: diffed.filter((p) => p.state === 'ESTABLISHED' && p.diff !== 'gone').length,
      scanDurationMs,
      lastRefreshedAt: Date.now(),
    }

    set({
      ports: diffed,
      summary,
    })
  },
  setPaused: (paused, reason = null) => {
    set((state) => ({
      isPaused: paused,
      pauseReason: paused ? reason : null,
      summary: {
        ...state.summary,
        isPaused: paused,
        pauseReason: paused ? reason : null,
      },
    }))
  },
  clearDiffs: () => {
    set((state) => ({
      // 移除 diff=gone 的行（已消失 5 秒的端口）
      // new / changed 行清空 diff 标记但保留
      ports: state.ports
        .filter((p) => p.diff !== 'gone')
        .map((p) => (p.diff ? { ...p, diff: null } : p)),
    }))
  },
  setHistory: (history) => set({ history }),
  setSettings: (settings) => set({ settings }),
  setLoading: (loading) => set({ loading }),
}))
