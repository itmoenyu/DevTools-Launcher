import { createContext, useContext } from 'react'

import useDesktopUpdaterController from '@/hooks/useDesktopUpdaterController'

type UpdaterValue = ReturnType<typeof useDesktopUpdaterController>

/**
 * 全局共享的更新状态机 Context。
 * Provider 在 UpdaterProvider.tsx 中单独导出，以满足 Fast Refresh 要求
 * （hook 文件只导出 React hook，避免与组件共存导致快速刷新失效）。
 */
export const UpdaterContext = createContext<UpdaterValue | null>(null)

export function useUpdater(): UpdaterValue {
  const value = useContext(UpdaterContext)
  if (!value) {
    throw new Error('useUpdater 必须在 <UpdaterProvider> 内部使用')
  }
  return value
}