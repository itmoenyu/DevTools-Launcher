import { renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { PortInspectionItem } from '@/types/runtime'
import type { ServiceWithRuntime } from '@/types/service'
import { usePortFilter } from '../usePortFilter'

const makeItem = (
  port: number,
  pid: number | null = null,
  state: PortInspectionItem['state'] = 'LISTENING',
): PortInspectionItem => ({
  port,
  state,
  protocol: 'TCP',
  localAddress: '127.0.0.1',
  occupied: true,
  pid,
  processName: 'svc.exe',
  processPath: 'C:\\svc.exe',
  diff: null,
})

// 用一个最小化 ServiceWithRuntime 兼容形态（hook 只读 s.service.port）
const makeService = (port: number, id: string): ServiceWithRuntime =>
  ({
    service: { id, name: id, port },
    runtime: { status: 'stopped', serviceId: id, pid: null, statusMessage: '' },
  }) as ServiceWithRuntime

describe('usePortFilter', () => {
  test('filter=all 返回全部', () => {
    const ports = [makeItem(80), makeItem(443), makeItem(8080)]
    const { result } = renderHook(() => usePortFilter(ports, 'all', []))
    expect(result.current).toEqual(ports)
  })

  test('filter=mine 只返回我服务声明的端口', () => {
    const ports = [makeItem(80), makeItem(3306), makeItem(8080)]
    const services = [makeService(3306, 'mysql'), makeService(8080, 'web')]
    const { result } = renderHook(() => usePortFilter(ports, 'mine', services))
    expect(result.current.map((p) => p.port)).toEqual([3306, 8080])
  })

  test('filter=listening 只返回 LISTENING 状态', () => {
    const ports = [
      makeItem(80, null, 'LISTENING'),
      makeItem(443, null, 'ESTABLISHED'),
      makeItem(8080, null, 'TIME_WAIT'),
    ]
    const { result } = renderHook(() => usePortFilter(ports, 'listening', []))
    expect(result.current.map((p) => p.port)).toEqual([80])
  })

  test('filter=conflict 返回我的服务端口 + 被外部占用（即 pid 存在）', () => {
    const ports = [makeItem(80, 100), makeItem(3306, 200), makeItem(8080, null)]
    const services = [makeService(3306, 'mysql'), makeService(8080, 'web')]
    const { result } = renderHook(() => usePortFilter(ports, 'conflict', services))
    expect(result.current.map((p) => p.port)).toEqual([3306])
  })
})
