import { describe, expect, test } from 'vitest'

import type {
  PortDiff,
  PortInspectionItem,
  PortInspectorSummary,
  PortProtocol,
  TcpState,
} from '../runtime'

describe('PortInspectionItem 扩展字段', () => {
  test('state 字段类型是 TcpState 联合', () => {
    const item: PortInspectionItem = {
      port: 8080,
      state: 'LISTENING' satisfies TcpState,
      protocol: 'TCP' satisfies PortProtocol,
      localAddress: '127.0.0.1',
      occupied: true,
      pid: 1234,
      processName: 'nginx.exe',
      processPath: 'C:\\nginx.exe',
      diff: null,
    }
    expect(item.state).toBe('LISTENING')
    expect(item.protocol).toBe('TCP')
    expect(item.localAddress).toBe('127.0.0.1')
    expect(item.diff).toBeNull()
  })

  test('diff 字段支持 new/changed/gone 三种值', () => {
    const ports: PortDiff[] = ['new', 'changed', 'gone']
    expect(ports).toHaveLength(3)
  })

  test('PortInspectorSummary 包含所有必需字段', () => {
    const summary: PortInspectorSummary = {
      total: 47,
      listening: 28,
      established: 0,
      conflict: 3,
      lastRefreshedAt: Date.now(),
      scanDurationMs: 120,
      isPaused: false,
      pauseReason: null,
    }
    expect(summary.total).toBe(47)
    expect(summary.conflict).toBe(3)
  })

  test('occupied 字段兼容旧值 false', () => {
    const item: PortInspectionItem = {
      port: 1234,
      state: 'TIME_WAIT',
      protocol: 'TCP',
      localAddress: '127.0.0.1',
      occupied: false,
      pid: null,
      processName: null,
      processPath: null,
    }
    expect(item.occupied).toBe(false)
    expect(item.state).toBe('TIME_WAIT')
  })
})
