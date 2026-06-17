export type ServiceType = 'redis' | 'mysql' | 'custom'

export type ServiceStatus =
  | 'unstarted'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export type StopStrategy = 'taskkill' | 'taskkill_force'

export type HealthcheckStrategy = 'process_and_port' | 'process_only'

export interface ServiceDefinition {
  id: string
  name: string
  serviceType: ServiceType
  isBuiltin: boolean
  execPath: string
  workDir: string
  args: string[]
  env: Record<string, string>
  port: number | null
  stopStrategy: StopStrategy
  healthcheckStrategy: HealthcheckStrategy
  description: string
  createdAt: string
  updatedAt: string
}

export interface ServiceRuntime {
  serviceId: string
  pid: number | null
  status: ServiceStatus
  startedAt: string | null
  stoppedAt: string | null
  exitCode: number | null
  lastHeartbeatAt: string | null
  statusMessage: string
}

export interface ServiceWithRuntime {
  service: ServiceDefinition
  runtime: ServiceRuntime
}

export interface ServicePayload {
  id?: string
  name: string
  serviceType: ServiceType
  execPath: string
  workDir: string
  args: string[]
  env: Record<string, string>
  port: number | null
  stopStrategy: StopStrategy
  healthcheckStrategy: HealthcheckStrategy
  description: string
}

export interface LaunchGroupItem {
  id: string
  groupId: string
  serviceId: string
  sortOrder: number
  dependsOnServiceId: string | null
}

export interface LaunchGroupDefinition {
  id: string
  name: string
  description: string
  items: LaunchGroupItem[]
  createdAt: string
  updatedAt: string
}
