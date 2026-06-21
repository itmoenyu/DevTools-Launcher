import { memo } from 'react'
import { Button, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

import { useServiceStore } from '@/store/service-store'

import { PortInspectorSummary } from './PortInspectorSummary'

/** 自定义实心方形暂停图标 */
function StopSquareIcon() {
  return (
    <svg viewBox="0 0 1024 1024" width="1em" height="1em" fill="#d81e06">
      <path d="M128 128h768v768H128z" />
    </svg>
  )
}

/** 自定义绿色播放三角图标 */
function PlayTriangleIcon() {
  return (
    <svg viewBox="-100 -50 1024 1024" width="1em" height="1em" fill="#1afa29">
      <path d="M170.666667 128l2.133333 768c0 34.133333 36.266667 53.333333 64 34.133333l597.333333-384c25.6-17.066667 25.6-53.333333 0-70.4L234.666667 91.733333C206.933333 74.666667 170.666667 93.866667 170.666667 128z" />
    </svg>
  )
}

/**
 * 顶部工具栏（两行分层布局）：
 *  - 第一行：标题 + 状态摘要 + 暂停/刷新
 *  - 第二行在 PortInspectorQuickFilters 中
 */
export const PortInspectorToolbar = memo(function PortInspectorToolbar({
  isRefreshLoading,
  isResumeLoading,
}: {
  isRefreshLoading: boolean
  isResumeLoading: boolean
}) {
  const isPaused = useServiceStore((s) => s.isPaused)
  const setPaused = useServiceStore((s) => s.setPaused)

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>端口管理</div>
        <div style={{ height: 20, width: 1, background: '#e0e0e0' }} />
        <PortInspectorSummary />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Tooltip
          title={
            isPaused
              ? '启动自动刷新'
              : '关闭自动刷新'
          }
        >
          <Button
            loading={isResumeLoading}
            icon={isPaused ? <PlayTriangleIcon /> : <StopSquareIcon />}
            onClick={() => setPaused(!isPaused, isPaused ? null : 'manual')}
          />
        </Tooltip>
        <Button
          loading={isRefreshLoading}
          icon={<ReloadOutlined />}
          onClick={() => window.dispatchEvent(new CustomEvent('port-inspector:refresh-now'))}
        >
          刷新
        </Button>
      </div>
    </div>
  )
})
