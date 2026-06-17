import dayjs from 'dayjs'

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
