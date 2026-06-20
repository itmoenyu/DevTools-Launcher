import { useEffect, useRef, type ReactNode } from 'react'

import useDesktopUpdaterController from '@/hooks/useDesktopUpdaterController'
import { updateAppSettings } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'

import { UpdaterContext } from './useUpdater'

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

  // 镜像最新的 updater 对象给 effect 使用，避免 hook 返回值整体作为依赖触发
  // 重复持久化。不能在 render 阶段直接赋值 ref.current（React 反模式，会让
  // 其他 effect / consumer 读到未提交的快照），所以统一在 commit 后的 effect
  // 里同步；第一次同步通过 ref 的初始值兜底（拿到的就是初始 updater 引用）。
  const updaterRef = useRef(updater)
  const lastPersistKeyRef = useRef('')

  useEffect(() => {
    // 把最新 updater 提交到 ref，effect 内部读取时永远拿到的是上一次 commit 的快照
    updaterRef.current = updater

    const current = updaterRef.current
    const { stage, latestVersion, releaseNotes } = current
    if (!settings) return
    if (stage !== 'latest' && stage !== 'available') return
    if (!releaseNotes && !latestVersion) return

    const key = `${stage}:${latestVersion}:${releaseNotes}`
    if (key === lastPersistKeyRef.current) return
    lastPersistKeyRef.current = key

    void updateAppSettings({
      ...settings,
      latestReleaseNotes: releaseNotes,
      latestCheckedVersion: latestVersion ?? '',
    }).then(setSettings)
    // 仅依赖 settings：updater 字段通过 ref 读取，避免 hook 返回对象引用变化
    // 触发 effect 重复执行。setSettings 是 zustand action，引用稳定。
  }, [settings, setSettings, updater])

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>
}