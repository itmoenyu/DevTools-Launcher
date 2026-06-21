import { LoadingOutlined } from '@ant-design/icons'
import { memo } from 'react'
import { useServiceStore } from '@/store/service-store'

/**
 * 底部状态条：汇总 + 扫描耗时 + 引擎 + 实时/暂停状态
 */
export const PortInspectorStatusBar = memo(function PortInspectorStatusBar({ isScanning }: { isScanning: boolean }) {
  const summary = useServiceStore((s) => s.summary)
  const free = Math.max(0, summary.total - summary.listening - summary.established)

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 16px',
        background: '#fafafa',
        fontSize: 12,
        color: '#595959',
        borderTop: '1px solid #f0f0f0',
      }}
    >
      <div style={{ display: 'flex', gap: 24 }}>
        <span>
          共 <strong style={{ color: '#262626' }}>{summary.total}</strong> 个端口
        </span>
        <span style={{ color: '#52c41a' }}>
          <strong>{free}</strong> 空闲
        </span>
        <span style={{ color: '#faad14' }}>
          <strong>{summary.listening}</strong> 监听中
        </span>
        <span style={{ color: '#ff4d4f' }}>
          <strong>{summary.conflict}</strong> 冲突
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span>
          扫描耗时{' '}
          <strong style={{ color: '#262626' }}>{summary.scanDurationMs}ms</strong>
        </span>
        <span style={{ color: '#d9d9d9' }}>|</span>
        <span>
          引擎 <strong style={{ color: '#262626' }}>IP Helper API</strong>
        </span>
        <span style={{ color: '#d9d9d9' }}>|</span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: summary.isPaused ? '#bfbfbf' : '#52c41a',
              marginRight: 4,
            }}
          />
          {summary.isPaused ? '已暂停' : isScanning ? <><LoadingOutlined style={{ marginRight: 4 }} />实时</> : '实时'}
        </span>
      </div>
    </div>
  )
})
