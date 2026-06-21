import { Card } from 'antd'
import { useEffect, useState } from 'react'

import { useServiceStore } from '@/store/service-store'
import { usePortFilter } from '@/modules/port-manager/usePortFilter'
import { usePortInspector } from '@/modules/port-manager/usePortInspector'
import { usePortDiff } from '@/modules/port-manager/usePortDiff'
import type { PortFilterMode } from '@/modules/port-manager/constants'

import { PortInspectorToolbar } from '@/components/port/PortInspectorToolbar'
import { PortInspectorQuickFilters } from '@/components/port/PortInspectorQuickFilters'
import { PortInspectorTable } from '@/components/port/PortInspectorTable'
import { PortInspectorStatusBar } from '@/components/port/PortInspectorStatusBar'
import { PortRowStyles } from '@/components/port/port-row-styles'

/**
 * 端口管理页 - 瘦入口
 * 只做：订阅 store + 调度 hooks + 拼装组件。
 */
export function PortInspectorPageMain() {
  const ports = useServiceStore((s) => s.ports)
  const services = useServiceStore((s) => s.services)
  const clearDiffs = useServiceStore((s) => s.clearDiffs)

  const [filter, setFilter] = useState<PortFilterMode>('all')
  const filteredPorts = usePortFilter(ports, filter, services)
  const { refreshNow } = usePortInspector()
  const { scheduleClearDiffs } = usePortDiff(clearDiffs)

  // 当 ports 中出现 diff 标记时，5 秒后清空
  useEffect(() => {
    if (ports.some((p) => p.diff)) {
      scheduleClearDiffs()
    }
  }, [ports, scheduleClearDiffs])

  // 工具栏「刷新」按钮通过 CustomEvent 触发
  useEffect(() => {
    const onRefresh = () => void refreshNow()
    window.addEventListener('port-inspector:refresh-now', onRefresh)
    return () => window.removeEventListener('port-inspector:refresh-now', onRefresh)
  }, [refreshNow])

  return (
    <div className="page-container">
      <PortRowStyles />
      <Card className="glass-card" bordered={false} styles={{ body: { padding: 0 } }}>
        <PortInspectorToolbar />
        <PortInspectorQuickFilters mode={filter} onChange={setFilter} />
        <PortInspectorTable
          ports={filteredPorts}
          services={services}
          onKill={() => void refreshNow()}
        />
        <PortInspectorStatusBar />
      </Card>
    </div>
  )
}

export default PortInspectorPageMain
