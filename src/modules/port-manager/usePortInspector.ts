import { useCallback, useEffect, useRef, useState } from 'react'

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
  const [isUserScanning, setIsUserScanning] = useState(false)

  // 后台扫描（自动轮询 / mount / 标签页切回），不触发按钮 loading
  const scan = useCallback(async () => {
    if (inFlightRef.current) return // 防止重叠
    inFlightRef.current = true
    const t0 = performance.now()
    try {
      const result = await listListeningPorts()
      const duration = Math.round(performance.now() - t0)

      // 数据无变化时跳过 store 更新，避免无意义渲染
      const current = useServiceStore.getState().ports
      if (!current || !hasPortsChanged(current, result)) return

      useServiceStore.getState().replacePorts(result, duration)
    } catch (err) {
      console.error('[port-inspector] scan failed:', err)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // 用户主动扫描（刷新 / 恢复），附带按钮 loading 反馈
  const scanWithFeedback = useCallback(async () => {
    if (inFlightRef.current) return
    setIsUserScanning(true)
    inFlightRef.current = true
    const t0 = performance.now()
    try {
      const result = await listListeningPorts()
      const duration = Math.round(performance.now() - t0)

      const current = useServiceStore.getState().ports
      if (!current || !hasPortsChanged(current, result)) return

      useServiceStore.getState().replacePorts(result, duration)
    } catch (err) {
      console.error('[port-inspector] scan failed:', err)
    } finally {
      inFlightRef.current = false
      setIsUserScanning(false)
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

  // 从暂停恢复时立即扫一次，不用等 interval 周期
  const prevPausedRef = useRef(isPaused)
  useEffect(() => {
    if (prevPausedRef.current && !isPaused) {
      void scanWithFeedback()
    }
    prevPausedRef.current = isPaused
  }, [isPaused, scanWithFeedback])

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
    await scanWithFeedback()
  }, [scanWithFeedback])

  return { refreshNow, isScanning: isUserScanning }
}
