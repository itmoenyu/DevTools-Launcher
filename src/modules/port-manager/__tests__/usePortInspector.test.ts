import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useServiceStore } from '@/store/service-store'
import * as api from '@/services/tauri-api/client'
import type { PortInspectionItem } from '@/types/runtime'

import { PORT_REFRESH_INTERVAL_MS } from '../constants'
import { usePortInspector } from '../usePortInspector'

vi.mock('@/services/tauri-api/client', () => ({
  listListeningPorts: vi.fn(),
}))

const makeItem = (port: number): PortInspectionItem => ({
  port,
  state: 'LISTENING',
  protocol: 'TCP',
  localAddress: '127.0.0.1',
  occupied: true,
  pid: 100,
  processName: 'svc',
  processPath: null,
  diff: null,
})

describe('usePortInspector', () => {
  beforeEach(() => {
    useServiceStore.setState({
      ports: [],
      summary: {
        total: 0,
        listening: 0,
        established: 0,
        conflict: 0,
        lastRefreshedAt: null,
        scanDurationMs: 0,
        isPaused: false,
        pauseReason: null,
      },
      isPaused: false,
      pauseReason: null,
    })
    vi.useFakeTimers()
    vi.mocked(api.listListeningPorts).mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('启动后立即调用一次 listListeningPorts', async () => {
    vi.mocked(api.listListeningPorts).mockResolvedValue([makeItem(80)])
    renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(1)
    expect(useServiceStore.getState().ports).toHaveLength(1)
  })

  test('2 秒后再次调用', async () => {
    vi.mocked(api.listListeningPorts).mockResolvedValue([])
    renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PORT_REFRESH_INTERVAL_MS)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(2)
  })

  test('isPaused=true 后停止轮询', async () => {
    vi.mocked(api.listListeningPorts).mockResolvedValue([])
    renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => {
      useServiceStore.getState().setPaused(true, 'manual')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PORT_REFRESH_INTERVAL_MS * 3)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(1)
  })

  test('refreshNow 立即触发一次扫描', async () => {
    vi.mocked(api.listListeningPorts).mockResolvedValue([])
    const { result } = renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await result.current.refreshNow()
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(2)
  })
})
