export interface PortInspectionItem {
  port: number
  occupied: boolean
  pid: number | null
  processName: string | null
  processPath: string | null
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
