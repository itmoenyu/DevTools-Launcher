import dayjs from 'dayjs'

export const statusTextMap: Record<string, string> = {
  unstarted: '未启动',
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  error: '异常',
}

export function formatStatus(status: string) {
  return statusTextMap[status] || status
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return '--'
  }

  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

export function formatDuration(startedAt: string | null) {
  if (!startedAt) {
    return '--'
  }

  const started = dayjs(startedAt)
  const diffInSeconds = Math.max(dayjs().diff(started, 'second'), 0)
  const hours = Math.floor(diffInSeconds / 3600)
  const minutes = Math.floor((diffInSeconds % 3600) / 60)
  const seconds = diffInSeconds % 60

  return `${hours}h ${minutes}m ${seconds}s`
}
