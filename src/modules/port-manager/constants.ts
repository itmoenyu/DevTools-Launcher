export const PORT_REFRESH_INTERVAL_MS = 2000
export const PORT_DIFF_FADE_OUT_MS = 5000
export const PORT_SCAN_TIMEOUT_MS = 5000

export type PortFilterMode = 'all' | 'mine' | 'listening' | 'conflict'

export const PORT_FILTER_LABELS: Record<PortFilterMode, string> = {
  all: '全部',
  mine: '我的服务',
  listening: '仅 LISTENING',
  conflict: '仅冲突',
}
