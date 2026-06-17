import type { PortInspectionItem } from '@/types/runtime'
import type { ServiceStatus, ServiceWithRuntime } from '@/types/service'
import { formatDateTime } from '@/utils/formatters'

export type ServiceStatusTone =
  | 'success'
  | 'error'
  | 'processing'
  | 'default'
  | 'warning'

export type ServiceStatusPresentationCode = ServiceStatus | 'port_conflict'

export interface ServiceStatusPresentation {
  code: ServiceStatusPresentationCode
  label: string
  tone: ServiceStatusTone
  detail: string
  portInspection: PortInspectionItem | null
  hasIssue: boolean
}

export interface ServiceLifecycleExplanation {
  label: string
  detail: string
}

export interface ServiceInstanceSourceExplanation {
  code:
    | 'managed_current'
    | 'managed_recovered'
    | 'external_conflict'
    | 'port_observed'
    | 'port_idle'
    | 'config_only'
  label: string
  detail: string
  tone: ServiceStatusTone
}

export interface ServiceActionAvailability {
  startDisabled: boolean
  startReason: string
  stopDisabled: boolean
  stopReason: string
  restartDisabled: boolean
  restartReason: string
  killDisabled: boolean
  killReason: string
}

const serviceStatusTextMap: Record<ServiceStatusPresentationCode, string> = {
  unstarted: '未启动',
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  error: '异常',
  port_conflict: '端口冲突',
}

function formatPortOccupancyDetail(portInspection: PortInspectionItem) {
  const processName = portInspection.processName?.trim() || '未知进程'
  const pidText = portInspection.pid ? `PID ${portInspection.pid}` : 'PID 未知'

  return `端口 ${portInspection.port} 当前被 ${processName}（${pidText}）占用`
}

function isRecoveredManagedRuntime(record: ServiceWithRuntime) {
  const statusMessage = record.runtime.statusMessage

  return (
    Boolean(record.runtime.pid) &&
    (statusMessage.includes('上次托管') ||
      statusMessage.includes('恢复接管') ||
      statusMessage.includes('自动恢复状态'))
  )
}

function getRuntimeAndPortRelation(
  record: ServiceWithRuntime,
  ports: PortInspectionItem[],
) {
  const portInspection = getServicePortInspection(record.service, ports)
  const runtimePid = record.runtime.pid
  const hasManagedPort = record.service.port !== null
  const sameProcessOccupyingPort =
    Boolean(runtimePid) && Boolean(portInspection?.pid) && runtimePid === portInspection?.pid
  const hasExternalPortOccupancy =
    hasManagedPort && Boolean(portInspection?.occupied) && !sameProcessOccupyingPort

  return {
    portInspection,
    runtimePid,
    hasManagedPort,
    sameProcessOccupyingPort,
    hasExternalPortOccupancy,
  }
}

function isServiceConfigured(record: ServiceWithRuntime) {
  return Boolean(record.service.execPath.trim() && record.service.workDir.trim())
}

export function getFriendlyServiceActionError(
  action: 'start' | 'stop' | 'restart' | 'kill',
  error: unknown,
) {
  const actionTextMap = {
    start: '启动',
    stop: '停止',
    restart: '重启',
    kill: '强制结束',
  } as const
  const rawMessage = error instanceof Error ? error.message : `${actionTextMap[action]}失败`

  if (rawMessage.includes('缺少 exe 路径或工作目录')) {
    return '当前服务还没配置完整。请先补齐可执行文件路径和工作目录，再重新尝试。'
  }

  if (rawMessage.includes('可执行文件不存在')) {
    return `${rawMessage}。这通常表示你移动了安装目录，或者配置里还是旧路径。`
  }

  if (rawMessage.includes('端口') && rawMessage.includes('已被占用')) {
    return `${rawMessage}。这通常表示同端口已经有系统服务、命令行窗口或其他工具启动的外部实例。`
  }

  if (rawMessage.includes('没有记录到可停止的进程 PID')) {
    return '当前没有可由 Launcher 接管的进程记录。只有通过面板启动并被记录到 PID 的实例，面板才能稳定停止或重启。'
  }

  if (rawMessage.includes('未能结束进程 PID') || rawMessage.includes('尝试强制结束 PID')) {
    return `${rawMessage}。你可以先去任务管理器确认目标进程是否仍然存在。`
  }

  return rawMessage
}

export function collectServicePorts(services: ServiceWithRuntime[]) {
  return [...new Set(services.map((item) => item.service.port).filter((port): port is number => port !== null))]
    .sort((left, right) => left - right)
}

export function mergePortInspectionItems(
  current: PortInspectionItem[],
  next: PortInspectionItem[],
) {
  const portMap = new Map<number, PortInspectionItem>()

  current.forEach((item) => {
    portMap.set(item.port, item)
  })

  next.forEach((item) => {
    portMap.set(item.port, item)
  })

  return [...portMap.values()].sort((left, right) => left.port - right.port)
}

export function getServicePortInspection(
  service: ServiceWithRuntime['service'],
  ports: PortInspectionItem[],
) {
  if (service.port === null) {
    return null
  }

  return ports.find((item) => item.port === service.port) ?? null
}

export function getServiceStatusPresentation(
  record: ServiceWithRuntime,
  ports: PortInspectionItem[],
): ServiceStatusPresentation {
  const { portInspection, hasManagedPort, hasExternalPortOccupancy } =
    getRuntimeAndPortRelation(record, ports)
  const runtimeStatus = record.runtime.status

  if (hasExternalPortOccupancy) {
    return {
      code: 'port_conflict',
      label: serviceStatusTextMap.port_conflict,
      tone: 'warning',
      detail: `${formatPortOccupancyDetail(portInspection!)}，当前不是 Launcher 托管的这份实例`,
      portInspection,
      hasIssue: true,
    }
  }

  if (runtimeStatus === 'running') {
    return {
      code: runtimeStatus,
      label: serviceStatusTextMap[runtimeStatus],
      tone: 'success',
      detail:
        record.runtime.statusMessage ||
        (portInspection?.occupied
          ? `${formatPortOccupancyDetail(portInspection)}，状态与托管记录一致`
          : 'Launcher 已记录该服务处于运行中'),
      portInspection,
      hasIssue: false,
    }
  }

  if (runtimeStatus === 'starting' || runtimeStatus === 'stopping') {
    return {
      code: runtimeStatus,
      label: serviceStatusTextMap[runtimeStatus],
      tone: 'processing',
      detail: record.runtime.statusMessage || serviceStatusTextMap[runtimeStatus],
      portInspection,
      hasIssue: false,
    }
  }

  if (runtimeStatus === 'error') {
    return {
      code: runtimeStatus,
      label: serviceStatusTextMap[runtimeStatus],
      tone: 'error',
      detail: record.runtime.statusMessage || '服务状态异常，请查看最近日志或操作记录',
      portInspection,
      hasIssue: true,
    }
  }

  if (portInspection?.occupied) {
    return {
      code: 'port_conflict',
      label: serviceStatusTextMap.port_conflict,
      tone: 'warning',
      detail: `${formatPortOccupancyDetail(portInspection)}，当前服务自身处于未运行状态`,
      portInspection,
      hasIssue: true,
    }
  }

  if (runtimeStatus === 'stopped' || runtimeStatus === 'unstarted') {
    const detail = hasManagedPort
      ? `端口 ${record.service.port} 当前空闲，服务未运行`
      : record.runtime.statusMessage || '未配置端口，当前仅依据 Launcher 运行态判断'

    return {
      code: runtimeStatus,
      label: serviceStatusTextMap[runtimeStatus],
      tone: 'default',
      detail,
      portInspection,
      hasIssue: false,
    }
  }

  return {
    code: runtimeStatus,
    label: serviceStatusTextMap[runtimeStatus] ?? runtimeStatus,
    tone: 'default',
    detail: record.runtime.statusMessage || runtimeStatus,
    portInspection,
    hasIssue: false,
  }
}

export function getServiceLifecycleExplanation(
  record: ServiceWithRuntime,
  ports: PortInspectionItem[],
): ServiceLifecycleExplanation {
  const presentation = getServiceStatusPresentation(record, ports)
  const sourceExplanation = getServiceInstanceSourceExplanation(record, ports)
  const startedAtText = formatDateTime(record.runtime.startedAt)
  const stoppedAtText = formatDateTime(record.runtime.stoppedAt)

  if (presentation.code === 'running') {
    return {
      label: '已进入运行阶段',
      detail:
        record.runtime.startedAt !== null
          ? `Launcher 记录这项服务从 ${startedAtText} 开始运行；只要托管进程和端口状态持续一致，页面就会保持“运行中”。`
          : 'Launcher 已把这项服务标记为运行中，说明最近一次启动流程已经走完并进入稳定运行阶段。',
    }
  }

  if (presentation.code === 'starting') {
    return {
      label: '正在建立运行态',
      detail:
        record.runtime.statusMessage ||
        'Launcher 已发起启动，但还在等待进程拉起、端口就绪或健康检查通过，所以页面暂时显示“启动中”。',
    }
  }

  if (presentation.code === 'stopping') {
    return {
      label: '正在退出运行阶段',
      detail:
        record.runtime.statusMessage ||
        'Launcher 已发起停止操作，但还在等待目标进程真正退出，所以页面暂时显示“停止中”。',
    }
  }

  if (presentation.code === 'error') {
    return {
      label: '最近一次生命周期异常',
      detail:
        record.runtime.statusMessage ||
        'Launcher 最近一次启动、停止或运行检查出现异常；这类状态通常需要结合日志、端口占用和操作记录一起排查。',
    }
  }

  if (presentation.code === 'port_conflict') {
    return {
      label: '托管记录与现场实例不一致',
      detail:
        record.runtime.startedAt !== null
          ? `Launcher 曾在 ${startedAtText} 记录过这项服务的生命周期，但当前现场已经变成“${sourceExplanation.label}”，所以优先提示“端口冲突”。`
          : `Launcher 当前没有拿到可接管的运行生命周期，但端口探测发现现场确实有实例在占用；当前识别结果是“${sourceExplanation.label}”。`,
    }
  }

  if (presentation.code === 'stopped') {
    return {
      label: '最近一次运行已结束',
      detail:
        record.runtime.stoppedAt !== null
          ? `Launcher 记录这项服务最近一次在 ${stoppedAtText} 停止，目前已经退出运行阶段。`
          : 'Launcher 已确认这项服务当前不在运行阶段，但还没有保留到明确的停止时间。',
    }
  }

  return {
    label: '尚未进入托管运行阶段',
    detail:
      record.runtime.startedAt !== null
        ? `虽然曾在 ${startedAtText} 启动过，但当前没有处于运行阶段；如果你刚修改完配置，建议重新启动一次确认。`
        : '这项服务还没有在当前托管记录里成功进入运行阶段，通常表示你还没启动过，或启动前就被端口/配置问题拦住了。',
  }
}

export function getServiceInstanceSourceExplanation(
  record: ServiceWithRuntime,
  ports: PortInspectionItem[],
): ServiceInstanceSourceExplanation {
  const presentation = getServiceStatusPresentation(record, ports)
  const { portInspection, runtimePid, hasManagedPort, sameProcessOccupyingPort } =
    getRuntimeAndPortRelation(record, ports)
  const recoveredManagedRuntime = isRecoveredManagedRuntime(record)

  if (presentation.code === 'port_conflict' && portInspection?.occupied) {
    return {
      code: 'external_conflict',
      label: '外部实例占用',
      tone: 'warning',
      detail: runtimePid
        ? `${formatPortOccupancyDetail(portInspection)}，但 Launcher 当前记录的托管 PID 是 ${runtimePid}，两边对不上，所以这次占用被判定为外部实例占用。`
        : `${formatPortOccupancyDetail(portInspection)}，Launcher 没记录到可接管的 PID，所以这次占用被判定为外部实例占用。`,
    }
  }

  if (runtimePid) {
    const label = recoveredManagedRuntime
      ? hasManagedPort
        ? '旧托管实例占用'
        : '旧托管实例'
      : hasManagedPort
        ? '当前托管实例占用'
        : '当前托管实例'

    return {
      code: recoveredManagedRuntime ? 'managed_recovered' : 'managed_current',
      label,
      tone: 'success',
      detail: recoveredManagedRuntime
        ? hasManagedPort
          ? sameProcessOccupyingPort
            ? `Launcher 重启后重新识别到上次托管的 PID ${runtimePid}，并确认它仍在占用端口 ${record.service.port}，所以这里显式标记为旧托管实例占用。`
            : `Launcher 重启后重新识别到上次托管的 PID ${runtimePid}，但端口现场还需要结合冲突提示一起看。`
          : `Launcher 重启后重新识别到上次托管的 PID ${runtimePid}；因为没有配置端口，所以这里只能按旧托管实例恢复接管来展示。`
        : hasManagedPort
          ? sameProcessOccupyingPort
            ? `当前主要依据 Launcher 记录的 PID ${runtimePid}，并且它与端口 ${record.service.port} 的占用结果一致，所以这里显示为当前托管实例占用。`
            : `当前主要依据 Launcher 记录的 PID ${runtimePid} 判断运行态，但端口现场还需要结合冲突提示一起看。`
          : `当前主要依据 Launcher 记录的 PID ${runtimePid} 判断运行态；因为没有配置端口，所以不会做端口归属校验。`,
    }
  }

  if (portInspection?.occupied) {
    return {
      code: 'port_observed',
      label: '端口探测到的实例',
      tone: 'warning',
      detail: `${formatPortOccupancyDetail(portInspection)}。Launcher 没记录到可接管的 PID，所以只能确认“现场有实例”，不能确认它一定能被面板安全停止。`,
    }
  }

  if (hasManagedPort) {
    return {
      code: 'port_idle',
      label: '端口空闲',
      tone: 'default',
      detail: `当前端口 ${record.service.port} 处于空闲状态，说明页面没有观测到任何正在占用该端口的实例。`,
    }
  }

  return {
    code: 'config_only',
    label: '仅配置记录',
    tone: 'default',
    detail: '当前既没有托管 PID，也没有配置端口可探测，页面只能依据最近一次托管记录展示状态，无法感知外部是否手动拉起过实例。',
  }
}

export function getServiceActionAvailability(
  record: ServiceWithRuntime,
  ports: PortInspectionItem[],
): ServiceActionAvailability {
  const presentation = getServiceStatusPresentation(record, ports)
  const sourceExplanation = getServiceInstanceSourceExplanation(record, ports)
  const configured = isServiceConfigured(record)
  const hasRuntimePid = Boolean(record.runtime.pid)

  let startDisabled = false
  let startReason = ''
  if (!configured) {
    startDisabled = true
    startReason = '请先补齐可执行文件路径和工作目录。'
  } else if (presentation.code === 'running') {
    startDisabled = true
    startReason = '这项服务已经在运行中，不需要重复启动。'
  } else if (presentation.code === 'starting') {
    startDisabled = true
    startReason = '当前已经在启动流程中，请等状态稳定后再操作。'
  } else if (presentation.code === 'stopping') {
    startDisabled = true
    startReason = '当前还在停止流程中，请等它完全停下后再启动。'
  } else if (presentation.code === 'port_conflict') {
    startDisabled = true
    startReason = `${presentation.detail}。请先处理外部占用后再启动。`
  }

  let stopDisabled = false
  let stopReason = ''
  if (presentation.code === 'stopping') {
    stopDisabled = true
    stopReason = '当前已经在停止流程中，请稍候。'
  } else if (!hasRuntimePid) {
    stopDisabled = true
    stopReason =
      presentation.code === 'port_conflict'
        ? `当前识别结果是“${sourceExplanation.label}”，不是 Launcher 记录到的托管 PID，面板不能直接用“停止”安全接管它。`
        : '当前没有 Launcher 记录到的托管 PID，普通停止无法定位目标进程。'
  }

  let restartDisabled = false
  let restartReason = ''
  if (!configured) {
    restartDisabled = true
    restartReason = '请先补齐可执行文件路径和工作目录。'
  } else if (presentation.code === 'starting' || presentation.code === 'stopping') {
    restartDisabled = true
    restartReason = '当前状态正在切换中，请等本轮动作结束后再重启。'
  } else if (!hasRuntimePid && presentation.code !== 'stopped' && presentation.code !== 'unstarted') {
    restartDisabled = true
    restartReason = '当前没有 Launcher 托管的 PID，面板无法确认应该重启哪一份实例。'
  } else if (presentation.code === 'port_conflict') {
    restartDisabled = true
    restartReason = `${presentation.detail}。请先处理“${sourceExplanation.label}”后再重启。`
  }

  let killDisabled = false
  let killReason = ''
  if (!hasRuntimePid) {
    killDisabled = true
    killReason =
      presentation.code === 'port_conflict'
        ? `当前冲突实例被识别为“${sourceExplanation.label}”，面板没有托管 PID；如需处理，请去端口页结束占用进程。`
        : '当前没有 Launcher 记录到的 PID，不能直接执行强制结束。'
  }

  return {
    startDisabled,
    startReason,
    stopDisabled,
    stopReason,
    restartDisabled,
    restartReason,
    killDisabled,
    killReason,
  }
}

export function findServiceByPort(
  port: number,
  services: ServiceWithRuntime[],
) {
  return services.find((item) => item.service.port === port) ?? null
}
