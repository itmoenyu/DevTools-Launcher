export type LogLevel = 'info' | 'warn' | 'error'
export type StreamType = 'stdout' | 'stderr' | 'system'

export interface LogEntry {
  id: string
  serviceId: string
  logLevel: LogLevel
  streamType: StreamType
  content: string
  createdAt: string
}

export interface LogQuery {
  serviceId?: string
  keyword?: string
  limit?: number
}
