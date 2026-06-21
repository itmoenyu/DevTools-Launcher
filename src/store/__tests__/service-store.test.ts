import { beforeEach, describe, expect, test } from 'vitest'

import { useServiceStore } from '../service-store'
import type { PortInspectionItem } from '../../types/runtime'

const makeItem = (port: number, pid: number | null): PortInspectionItem => ({
  port,
  state: 'LISTENING',
  protocol: 'TCP',
  localAddress: '127.0.0.1',
  occupied: true,
  pid,
  processName: pid ? 'svc.exe' : null,
  processPath: pid ? 'C:\\svc.exe' : null,
  diff: null,
})

describe('ServiceStore - 端口扫描扩展', () => {
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
  })

  test('setPorts 计算 summary.total 和 summary.listening', () => {
    useServiceStore.getState().replacePorts([makeItem(8080, 100), makeItem(3306, null), makeItem(6379, 200)], 120)
    const s = useServiceStore.getState()
    expect(s.summary.total).toBe(3)
    expect(s.summary.listening).toBe(3)
    expect(s.summary.scanDurationMs).toBe(120)
    expect(s.summary.lastRefreshedAt).not.toBeNull()
  })

  test('setPorts 标记新增的端口 diff=new', () => {
    useServiceStore.getState().replacePorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().replacePorts([makeItem(8080, 100), makeItem(3306, 200)], 60)
    const ports = useServiceStore.getState().ports
    const port3306 = ports.find((p) => p.port === 3306)!
    expect(port3306.diff).toBe('new')
    const port8080 = ports.find((p) => p.port === 8080)!
    expect(port8080.diff).toBeNull()
  })

  test('setPorts 标记 PID 变化为 diff=changed', () => {
    useServiceStore.getState().replacePorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().replacePorts([makeItem(8080, 999)], 60)
    const port8080 = useServiceStore.getState().ports.find((p) => p.port === 8080)!
    expect(port8080.diff).toBe('changed')
  })

  test('消失的端口 5 秒内保留在 ports（diff=gone），clearDiffs 后移除', () => {
    useServiceStore.getState().replacePorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().replacePorts([], 60)
    expect(useServiceStore.getState().ports).toHaveLength(1)
    expect(useServiceStore.getState().ports[0].diff).toBe('gone')
    useServiceStore.getState().clearDiffs()
    expect(useServiceStore.getState().ports).toHaveLength(0)
  })

  test('setPaused 设置 isPaused 和 pauseReason', () => {
    useServiceStore.getState().setPaused(true, 'manual')
    expect(useServiceStore.getState().isPaused).toBe(true)
    expect(useServiceStore.getState().pauseReason).toBe('manual')
    expect(useServiceStore.getState().summary.isPaused).toBe(true)
  })

  test('clearDiffs 清空所有 diff 字段', () => {
    useServiceStore.getState().replacePorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().replacePorts([makeItem(8080, 999)], 60)  // diff=changed
    expect(useServiceStore.getState().ports[0].diff).toBe('changed')
    useServiceStore.getState().clearDiffs()
    expect(useServiceStore.getState().ports[0].diff).toBeNull()
  })
})
