import { useEffect } from 'react'

import {
  getAppSettings,
  listLaunchGroups,
  listServices,
  onLogAppended,
  onPortConflictDetected,
  onServiceOperationFinished,
  onServiceRuntimeChanged,
  queryOperationHistory,
} from '@/services/tauri-api/client'
import { useLogStore } from '@/store/log-store'
import { useServiceStore } from '@/store/service-store'

export function useBootstrapData() {
  const setServices = useServiceStore((state) => state.setServices)
  const setLaunchGroups = useServiceStore((state) => state.setLaunchGroups)
  const setHistory = useServiceStore((state) => state.setHistory)
  const setPorts = useServiceStore((state) => state.setPorts)
  const setSettings = useServiceStore((state) => state.setSettings)
  const updateRuntime = useServiceStore((state) => state.updateRuntime)
  const setLoading = useServiceStore((state) => state.setLoading)
  const appendLog = useLogStore((state) => state.appendLog)

  useEffect(() => {
    let mounted = true
    const unlisteners: Array<() => void> = []

    async function bootstrap() {
      setLoading(true)

      try {
        const [services, groups, history, settings] = await Promise.all([
          listServices(),
          listLaunchGroups(),
          queryOperationHistory(),
          getAppSettings(),
        ])

        if (!mounted) {
          return
        }

        setServices(services)
        setLaunchGroups(groups)
        setHistory(history)
        setSettings(settings)

        unlisteners.push(await onServiceRuntimeChanged(updateRuntime))
        unlisteners.push(await onLogAppended(appendLog))
        unlisteners.push(
          await onServiceOperationFinished(async () => {
            const [services, history] = await Promise.all([listServices(), queryOperationHistory()])
            if (!mounted) {
              return
            }

            setServices(services)
            setHistory(history)
          }),
        )
        unlisteners.push(
          await onPortConflictDetected((item) => {
            if (!mounted) {
              return
            }

            const current = useServiceStore.getState().ports
            const next = [item, ...current.filter((portItem) => portItem.port !== item.port)]
            setPorts(next)
          }),
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      mounted = false
      unlisteners.forEach((dispose) => dispose())
    }
  }, [
    appendLog,
    setHistory,
    setLaunchGroups,
    setLoading,
    setPorts,
    setServices,
    setSettings,
    updateRuntime,
  ])
}
