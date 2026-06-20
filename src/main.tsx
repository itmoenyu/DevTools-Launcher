import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/app/providers'
import App from '@/app/App'
import { UpdaterProvider } from '@/app/UpdaterProvider'
import '@/styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <UpdaterProvider>
        <App />
      </UpdaterProvider>
    </AppProviders>
  </StrictMode>,
)
