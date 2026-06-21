import { useEffect, useState } from 'react'

import { useServiceStore } from '@/store/service-store'

import { PORT_REFRESH_INTERVAL_MS } from '@/modules/port-manager/constants'

/**
 * 顶部状态摘要：监听数 / 冲突数 / 上次更新时间
 */
export function PortInspectorSummary() {
  const summary = useServiceStore((s) => s.summary)
  const [now, setNow] = useState(Date.now())

  // 轮询周期与端口刷新同步，避免 1 秒一次的不必要渲染
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), PORT_REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const ageMs = summary.lastRefreshedAt ? now - summary.lastRefreshedAt : null
  const ageText =
    ageMs === null
      ? '—'
      : ageMs < 1000
        ? '刚刚'
        : `${Math.floor(ageMs / 1000)}秒前更新`
  const ageColor =
    ageMs === null ? '#8c8c8c' : ageMs < 5000 ? '#262626' : ageMs < 10000 ? '#8c8c8c' : '#bfbfbf'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontSize: 13,
        color: '#595959',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: summary.isPaused ? '#bfbfbf' : '#52c41a',
          boxShadow: summary.isPaused ? 'none' : '0 0 0 3px rgba(82,196,26,0.2)',
        }}
      />
      <span>
        <strong style={{ color: '#262626' }}>{summary.listening}</strong> 监听中
      </span>
      <span style={{ color: '#d9d9d9' }}>·</span>
      <span style={{ color: summary.conflict > 0 ? '#ff4d4f' : '#595959' }}>
        <strong>{summary.conflict}</strong> 冲突
      </span>
      <span style={{ color: '#d9d9d9' }}>·</span>
      <span style={{ color: ageColor }}>{ageText}</span>
    </div>
  )
}
