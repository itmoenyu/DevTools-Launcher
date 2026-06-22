export type TcpState =
  | 'LISTENING' | 'ESTABLISHED' | 'TIME_WAIT' | 'CLOSE_WAIT'
  | 'FIN_WAIT1' | 'FIN_WAIT2' | 'SYN_SENT' | 'SYN_RECEIVED'
  | 'CLOSING' | 'LAST_ACK' | 'DELETE_TCB' | 'UNKNOWN'

export type PortProtocol = 'TCP' | 'UDP'

export type PortDiff = 'new' | 'changed' | 'gone'

export interface PortInspectionItem {
  port: number
  state: TcpState
  protocol: PortProtocol
  localAddress: string
  occupied: boolean
  pid: number | null
  processName: string | null
  processPath: string | null
  diff?: PortDiff | null
}

export interface PortInspectorSummary {
  total: number
  listening: number
  established: number
  conflict: number
  lastRefreshedAt: number | null
  scanDurationMs: number
  isPaused: boolean
  pauseReason: 'manual' | 'tab-hidden' | null
}

export interface OperationHistoryItem {
  id: string
  serviceId: string
  serviceName: string
  operationType: 'start' | 'stop' | 'restart' | 'kill' | 'save' | 'launch_group'
  result: 'success' | 'failed'
  message: string
  createdAt: string
}
