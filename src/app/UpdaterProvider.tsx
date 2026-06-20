import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'

import useDesktopUpdaterController from '@/hooks/useDesktopUpdaterController'
import { updateAppSettings } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'

type UpdaterValue = ReturnType<typeof useDesktopUpdaterController>

const UpdaterContext = createContext<UpdaterValue | null>(null)

/**
 * 全局挂载更新状态机的单例。
 *
 * useDesktopUpdaterController 内部持有一个不可共享的 Update 实例（updateRef），
 * 必须全局只挂载一次，否则会出现重复 fetch / 重复下载。这里通过 Context 把状态和
 * action 下发给 App.tsx（启动检查 + Toast）与设置页（手动检查面板）共用。
 */
export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useDesktopUpdaterController()
  const settings = useServiceStore((state) => state.settings)
  const setSettings = useServiceStore((state) => state.setSettings)

  // 把检查更新结果（latestReleaseNotes / latestCheckedVersion）持久化到数据库。
  // 这段逻辑原来在设置页，搬到全局后无论用户在哪个页面都能正确记录最近一次检查结果。
  const lastPersistRef = useRef('')

  useEffect(() => {
    if (!settings) return
    const { stage, latestVersion, releaseNotes } = updater
    if (stage !== 'latest' && stage !== 'available') return
    if (!releaseNotes && !latestVersion) return

    const key = `${stage}:${latestVersion}:${releaseNotes}`
    if (key === lastPersistRef.current) return
    lastPersistRef.current = key

    void updateAppSettings({
      ...settings,
      latestReleaseNotes: releaseNotes,
      latestCheckedVersion: latestVersion ?? '',
    }).then(setSettings)
    // updater 字段拆解进依赖，避免把整个 updater 对象作为依赖导致无限触发。
  }, [
    updater.stage,
    updater.latestVersion,
    updater.releaseNotes,
    settings,
    setSettings,
  ])

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>
}

export function useUpdater(): UpdaterValue {
  const value = useContext(UpdaterContext)
  if (!value) {
    throw new Error('useUpdater 必须在 <UpdaterProvider> 内部使用')
  }
  return value
}
