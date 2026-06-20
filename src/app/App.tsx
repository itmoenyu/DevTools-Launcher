import { App as AntApp, Button, Space } from 'antd'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { RouterProvider } from 'react-router-dom'

import { CloseConfirmModal } from '@/components/common/CloseConfirmModal'
import { useBootstrapData } from '@/hooks/useBootstrapData'
import { handleCloseDecision } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'

import { useUpdater } from './useUpdater'
import { appRouter } from './routes'

// notification key 固定，用于去重与替换（同一类提示只保留一个）
const NOTIFICATION_KEY_DOWNLOADED = 'update-downloaded'
const NOTIFICATION_KEY_ERROR = 'update-error'

export function App() {
  useBootstrapData()
  const { notification } = AntApp.useApp()
  const settings = useServiceStore((state) => state.settings)

  const {
    stage,
    latestVersion,
    errorMessage,
    checkForUpdates,
    downloadUpdate,
    restartToUpdate,
  } = useUpdater()

  const [showCloseModal, setShowCloseModal] = useState(false)

  // 标记当前这次检查是否由启动自动触发（决定发现新版本后是否自动后台下载）。
  // 手动点“检查更新”时不自动下载，交给设置页 UI。
  const autoCheckTriggeredRef = useRef(false)
  // 防止启动自动检查 effect 重复触发。
  const startupCheckDoneRef = useRef(false)

  useEffect(() => {
    const unlisten = listen('close-requested', () => {
      setShowCloseModal(true)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // 启动后静默检查一次更新（受 autoUpdateEnabled 开关控制）。
  // settings 从 useBootstrapData 异步加载，加载完成且开关开启时触发一次。
  useEffect(() => {
    if (startupCheckDoneRef.current) return
    if (!settings) return
    startupCheckDoneRef.current = true

    if (!settings.autoUpdateEnabled) return

    autoCheckTriggeredRef.current = true
    void checkForUpdates()
  }, [settings, checkForUpdates])

  // 发现新版本时：若由启动自动检查触发，则立即后台静默下载（不弹任何 Modal）。
  useEffect(() => {
    if (stage !== 'available') return
    if (!autoCheckTriggeredRef.current) return
    void downloadUpdate()
  }, [stage, downloadUpdate])

  // 下载完成：弹 corner toast 提示“已就绪，点击重启”。
  useEffect(() => {
    if (stage !== 'downloaded') return

    notification.info({
      key: NOTIFICATION_KEY_DOWNLOADED,
      message: `发现新版本 v${latestVersion ?? '--'}`,
      description: '更新已下载完成，点击下方按钮重启应用即可完成更新。',
      duration: false, // 常驻，直到用户重启或手动关闭
      placement: 'bottomRight',
      btn: (
        <Space>
          <Button
            size="small"
            onClick={() => notification.destroy(NOTIFICATION_KEY_DOWNLOADED)}
          >
            稍后重启
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              notification.destroy(NOTIFICATION_KEY_DOWNLOADED)
              void restartToUpdate()
            }}
          >
            立即重启
          </Button>
        </Space>
      ),
    })
  }, [stage, latestVersion, notification, restartToUpdate])

  // 检查 / 下载失败：只提示一次，不自动重试（符合“失败只提示”设计）。
  useEffect(() => {
    if (stage !== 'error') return

    notification.error({
      key: NOTIFICATION_KEY_ERROR,
      message: '更新检查失败',
      description: errorMessage ?? '未能完成更新检查或下载，可在「通用设置」页稍后重试。',
      duration: 8,
      placement: 'bottomRight',
    })
  }, [stage, errorMessage, notification])

  async function handleCloseConfirm(action: 'minimize' | 'quit', dontRemind: boolean) {
    setShowCloseModal(false)
    await handleCloseDecision(action, dontRemind)
  }

  return (
    <>
      <RouterProvider router={appRouter} />
      <CloseConfirmModal
        open={showCloseModal}
        defaultAction={settings?.closeAction ?? 'minimize'}
        defaultDontRemind={settings?.closeReminderDisabled ?? false}
        onConfirm={handleCloseConfirm}
        onCancel={() => setShowCloseModal(false)}
      />
    </>
  )
}

export default App
