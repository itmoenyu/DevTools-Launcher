import { create } from 'zustand'

import type { LogEntry } from '@/types/log'

interface LogStoreState {
  logs: Record<string, LogEntry[]>
  setLogs: (serviceId: string, logs: LogEntry[]) => void
  appendLog: (log: LogEntry) => void
  clearLogs: (serviceId: string) => void
}

export const useLogStore = create<LogStoreState>((set) => ({
  logs: {},
  setLogs: (serviceId, logs) =>
    set((state) => ({
      logs: {
        ...state.logs,
        [serviceId]: logs,
      },
    })),
  appendLog: (log) =>
    set((state) => ({
      logs: {
        ...state.logs,
        [log.serviceId]: [...(state.logs[log.serviceId] ?? []), log].slice(-500),
      },
    })),
  clearLogs: (serviceId) =>
    set((state) => ({
      logs: {
        ...state.logs,
        [serviceId]: [],
      },
    })),
}))
