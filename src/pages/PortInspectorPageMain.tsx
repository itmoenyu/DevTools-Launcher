import { Card } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useServiceStore } from '@/store/service-store'
import { usePortFilter } from '@/modules/port-manager/usePortFilter'
import { usePortInspector } from '@/modules/port-manager/usePortInspector'
import { usePortDiff } from '@/modules/port-manager/usePortDiff'
import { PORT_FILTER_LABELS, type PortFilterMode } from '@/modules/port-manager/constants'

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
  const isPaused = useServiceStore((s) => s.isPaused)
  const setPaused = useServiceStore((s) => s.setPaused)

  const [searchParams, setSearchParams] = useSearchParams()

  // 从 URL 恢复过滤模式
  const [filter, setFilter] = useState<PortFilterMode>(() => {
    const fromUrl = searchParams.get('filter')
    if (fromUrl && Object.hasOwn(PORT_FILTER_LABELS, fromUrl)) return fromUrl as PortFilterMode
    return 'all'
  })

  // 从 URL 恢复暂停状态（仅挂载时同步一次）
  useEffect(() => {
    if (searchParams.get('paused') === '1' && !isPaused) {
      setPaused(true, 'manual')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 搜索：回车触发，不实时过滤
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isSearchLoading, setIsSearchLoading] = useState(false)

  const filteredPorts = usePortFilter(ports, filter, services)
  const searchedPorts = useMemo(
    () => searchKeyword
      ? filteredPorts.filter((p) =>
          String(p.port).includes(searchKeyword)
          || p.pid?.toString().includes(searchKeyword)
          || p.processName?.toLowerCase().includes(searchKeyword.toLowerCase())
          || p.localAddress?.includes(searchKeyword),
        )
      : filteredPorts,
    [filteredPorts, searchKeyword],
  )

  const { refreshNow, scanSilent, isRefreshLoading, isResumeLoading, isScanning } = usePortInspector()
  const { scheduleClearDiffs } = usePortDiff(clearDiffs)

  // 搜索触发：设置关键词 → 静默扫描 → 完成后 loading 结束
  const handleSearch = useCallback(async (keyword: string) => {
    setSearchKeyword(keyword)
    if (!keyword) return
    setIsSearchLoading(true)
    await scanSilent()
    setIsSearchLoading(false)
  }, [scanSilent])

  // 过滤模式变化 → 同步到 URL
  useEffect(() => {
    setSearchParams((prev) => {
      if (filter === 'all') prev.delete('filter')
      else prev.set('filter', filter)
      return prev
    }, { replace: true })
  }, [filter, setSearchParams])

  // 暂停状态变化 → 同步到 URL
  useEffect(() => {
    setSearchParams((prev) => {
      if (isPaused) prev.set('paused', '1')
      else prev.delete('paused')
      return prev
    }, { replace: true })
  }, [isPaused, setSearchParams])

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

  // 搜索加载时清空 dataSource，避免旧数据 + Spin 同时出现
  const tableLoading = isSearchLoading && !!searchKeyword
  const displayPorts = tableLoading ? [] : searchedPorts

  return (
    <div className="page-container">
      <PortRowStyles />
      <Card className="glass-card" bordered={false} styles={{ body: { padding: 0 } }}>
        <PortInspectorToolbar isRefreshLoading={isRefreshLoading} isResumeLoading={isResumeLoading} />
        <PortInspectorQuickFilters mode={filter} onChange={setFilter} onSearch={handleSearch} />
        <PortInspectorTable
          ports={displayPorts}
          services={services}
          onKill={() => void refreshNow()}
          loading={tableLoading}
        />
        <PortInspectorStatusBar isScanning={isScanning} />
      </Card>
    </div>
  )
}

export default PortInspectorPageMain