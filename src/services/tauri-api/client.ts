import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import type { LogEntry } from '@/types/log'
import type { OperationHistoryItem, PortInspectionItem } from '@/types/runtime'
import type { AppSettings } from '@/types/settings'
import type {
  LaunchGroupDefinition,
  ServicePayload,
  ServiceRuntime,
  ServiceWithRuntime,
} from '@/types/service'

export const serviceEvents = {
  statusChanged: 'service-status-changed',
  logAppended: 'service-log-appended',
  operationFinished: 'service-operation-finished',
  portConflictDetected: 'port-conflict-detected',
} as const

export async function listServices() {
  return invoke<ServiceWithRuntime[]>('list_services')
}

export async function getServiceDetail(serviceId: string) {
  return invoke<ServiceWithRuntime>('get_service_detail', { serviceId })
}

export async function createCustomService(payload: ServicePayload) {
  return invoke<ServiceWithRuntime>('create_custom_service', { payload })
}

export async function updateService(payload: ServicePayload & { id: string }) {
  return invoke<ServiceWithRuntime>('update_service', { payload })
}

export async function deleteService(serviceId: string) {
  return invoke<boolean>('delete_service', { serviceId })
}

export async function startService(serviceId: string) {
  return invoke<ServiceRuntime>('start_service', { serviceId })
}

export async function stopService(serviceId: string) {
  return invoke<ServiceRuntime>('stop_service', { serviceId })
}

export async function restartService(serviceId: string) {
  return invoke<ServiceRuntime>('restart_service', { serviceId })
}

export async function forceKillService(serviceId: string) {
  return invoke<ServiceRuntime>('force_kill_service', { serviceId })
}

export async function getServiceRuntime(serviceId: string) {
  return invoke<ServiceRuntime>('get_service_runtime', { serviceId })
}

export async function inspectPorts(ports: number[]) {
  return invoke<PortInspectionItem[]>('inspect_ports', { ports })
}

export async function killProcessByPid(pid: number) {
  return invoke<boolean>('kill_process_by_pid', { pid })
}

export async function queryLogs(serviceId?: string, keyword?: string) {
  return invoke<LogEntry[]>('query_logs', { serviceId, keyword })
}

export async function clearLogsByService(serviceId: string) {
  return invoke<boolean>('clear_logs_by_service', { serviceId })
}

export async function listLaunchGroups() {
  return invoke<LaunchGroupDefinition[]>('list_launch_groups')
}

export async function createLaunchGroup(payload: LaunchGroupDefinition) {
  return invoke<LaunchGroupDefinition>('create_launch_group', { payload })
}

export async function updateLaunchGroup(payload: LaunchGroupDefinition) {
  return invoke<LaunchGroupDefinition>('update_launch_group', { payload })
}

export async function runLaunchGroup(groupId: string) {
  return invoke<ServiceRuntime[]>('run_launch_group', { groupId })
}

export async function queryOperationHistory() {
  return invoke<OperationHistoryItem[]>('query_operation_history')
}

export async function getAppSettings() {
  return invoke<AppSettings>('get_app_settings')
}

export async function updateAppSettings(payload: AppSettings) {
  return invoke<AppSettings>('update_app_settings', { payload })
}

export async function onServiceRuntimeChanged(
  callback: (runtime: ServiceRuntime) => void,
) {
  return listen<ServiceRuntime>(serviceEvents.statusChanged, (event) =>
    callback(event.payload),
  )
}

export async function onLogAppended(callback: (log: LogEntry) => void) {
  return listen<LogEntry>(serviceEvents.logAppended, (event) =>
    callback(event.payload),
  )
}

export async function onServiceOperationFinished(
  callback: (operation: string) => void,
) {
  return listen<string>(serviceEvents.operationFinished, (event) =>
    callback(event.payload),
  )
}

export async function onPortConflictDetected(
  callback: (item: PortInspectionItem) => void,
) {
  return listen<PortInspectionItem>(serviceEvents.portConflictDetected, (event) =>
    callback(event.payload),
  )
}

export async function disposeListeners(listeners: UnlistenFn[]) {
  listeners.forEach((dispose) => dispose())
}
