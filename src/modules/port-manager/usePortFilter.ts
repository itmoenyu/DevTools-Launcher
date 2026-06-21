import { useMemo } from 'react'

import type { PortInspectionItem } from '@/types/runtime'
import type { ServiceWithRuntime } from '@/types/service'

import type { PortFilterMode } from './constants'

export function usePortFilter(
  ports: PortInspectionItem[],
  mode: PortFilterMode,
  services: ServiceWithRuntime[],
): PortInspectionItem[] {
  return useMemo(() => {
    if (mode === 'all') return ports
    if (mode === 'listening') return ports.filter((p) => p.state === 'LISTENING' && p.diff !== 'gone')
    const myPorts = new Set(
      services
        .map((s) => s.service.port)
        .filter((p): p is number => typeof p === 'number'),
    )
    if (mode === 'mine') return ports.filter((p) => myPorts.has(p.port) && p.diff !== 'gone')
    if (mode === 'conflict')
      return ports.filter((p) => myPorts.has(p.port) && p.pid !== null && p.diff !== 'gone')
    return ports
  }, [ports, mode, services])
}
