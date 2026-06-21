import { useCallback, useEffect, useRef } from 'react'

import { useServiceStore } from '@/store/service-store'
import { listListeningPorts } from '@/services/tauri-api/client'
import type { PortInspectionItem } from '@/types/runtime'

import { PORT_REFRESH_INTERVAL_MS } from './constants'

/**
 * 浅比较端口列表：仅当有实际变化时才需要更新 store
 */
function hasPortsChanged(a: PortInspectionItem[], b: PortInspectionItem[]): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]
    const pb = b[i]
    if (pa.port !== pb.port) return true
    if (pa.pid !== pb.pid) return true
    if (pa.state !== pb.state) return true
    if (pa.processName !== pb.processName) return true
    if (pa.localAddress !== pb.localAddress) return true
  }
  return false
}

/**
 * 端口扫描器：每 5 秒调一次 `listListeningPorts`，结果写进 store。
 *
 * - 启动立即扫一次
 * - `isPaused=true` 停止轮询
 * - 标签页隐藏时暂停，切回时立即补一次
 * - `refreshNow()` 强制立即扫一次
 */
export function usePortInspector() {
  const isPaused = useServiceStore((s) => s.isPaused)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef<boolean>(false)

  const scan = useCallback(async () => {
    if (inFlightRef.current) return // 防止重叠
    inFlightRef.current = true
    const t0 = performance.now()
    try {
      const result = await listListeningPorts()
      const duration = Math.round(performance.now() - t0)

      // 数据无变化时跳过 store 更新，避免无意义渲染
      const current = useServiceStore.getState().ports
      if (!hasPortsChanged(current, result)) return

      useServiceStore.getState().replacePorts(result, duration)
    } catch (err) {
      console.error('[port-inspector] scan failed:', err)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // 主轮询生命周期 - 只在 isPaused 切换时增删 interval
  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(scan, PORT_REFRESH_INTERVAL_MS)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, scan])

  // mount 时立即扫一次（独立 effect，只跑一次，不随 isPaused 重 run）
  useEffect(() => {
    void scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 标签页可见性
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        useServiceStore.getState().setPaused(true, 'tab-hidden')
      } else {
        useServiceStore.getState().setPaused(false, null)
        void scan() // 切回立即补一次
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [scan])

  const refreshNow = useCallback(async () => {
    await scan()
  }, [scan])

  return { refreshNow }
}
