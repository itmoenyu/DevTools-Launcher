import { RouterProvider } from 'react-router-dom'

import { useBootstrapData } from '@/hooks/useBootstrapData'

import { appRouter } from './routes'

export function App() {
  useBootstrapData()

  return <RouterProvider router={appRouter} />
}

export default App
