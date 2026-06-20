import { App as AntApp, ConfigProvider } from 'antd'
import type { PropsWithChildren } from 'react'

import useGlassTheme from '@/styles/glass-theme'

export function AppProviders({ children }: PropsWithChildren) {
  const configProps = useGlassTheme()

  return (
    <ConfigProvider {...configProps}>
      <AntApp message={{ stack: { threshold: 3 } }} className={configProps.app?.className}>{children}</AntApp>
    </ConfigProvider>
  )
}
