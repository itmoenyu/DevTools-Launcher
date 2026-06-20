import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'

import { CloseConfirmModal } from '@/components/common/CloseConfirmModal'
import { useBootstrapData } from '@/hooks/useBootstrapData'
import { handleCloseDecision } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'

import { appRouter } from './routes'

export function App() {
  useBootstrapData()
  const [showCloseModal, setShowCloseModal] = useState(false)
  const settings = useServiceStore((state) => state.settings)

  useEffect(() => {
    const unlisten = listen('close-requested', () => {
      setShowCloseModal(true)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

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
