import { Button, Tooltip } from 'antd'
import { PauseOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'

import { useServiceStore } from '@/store/service-store'

import { PortInspectorSummary } from './PortInspectorSummary'

/**
 * 顶部工具栏（两行分层布局）：
 *  - 第一行：标题 + 状态摘要 + 暂停/刷新/设置
 *  - 第二行在 PortInspectorQuickFilters 中
 */
export function PortInspectorToolbar() {
  const isPaused = useServiceStore((s) => s.isPaused)
  const pauseReason = useServiceStore((s) => s.pauseReason)
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
              ? `已暂停（${pauseReason === 'tab-hidden' ? '标签页隐藏' : '手动'}）`
              : '暂停自动刷新'
          }
        >
          <Button
            icon={<PauseOutlined />}
            onClick={() => setPaused(!isPaused, isPaused ? null : 'manual')}
          />
        </Tooltip>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => window.dispatchEvent(new CustomEvent('port-inspector:refresh-now'))}
        >
          刷新
        </Button>
        <Button icon={<SettingOutlined />} />
      </div>
    </div>
  )
}
