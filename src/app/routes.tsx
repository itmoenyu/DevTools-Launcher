import { createHashRouter } from 'react-router-dom'

import { AppShellLayoutMain } from '@/components/layout/AppShellLayoutMain'
import AppearanceSettingsPageMain from '@/pages/AppearanceSettingsPageMain'
import DashboardPageMain from '@/pages/DashboardPageMain'
import GeneralSettingsPageMain from '@/pages/GeneralSettingsPageMain'
import LaunchGroupPageMain from '@/pages/LaunchGroupPageMain'
import OperationHistoryPageMain from '@/pages/OperationHistoryPageMain'
import PortInspectorPageMain from '@/pages/PortInspectorPageMain'
import RealtimeLogPageMain from '@/pages/RealtimeLogPageMain'
import ServiceDetailPageMain from '@/pages/ServiceDetailPageMain'
import ServiceListPageMain from '@/pages/ServiceListPageMain'
import ServiceSettingsPageMain from '@/pages/ServiceSettingsPageMain'

export const appRouter = createHashRouter([
  {
    path: '/',
    element: <AppShellLayoutMain />,
    children: [
      { index: true, element: <DashboardPageMain /> },
      { path: 'services', element: <ServiceListPageMain /> },
      { path: 'services/:serviceId', element: <ServiceDetailPageMain /> },
      { path: 'logs', element: <RealtimeLogPageMain /> },
      { path: 'ports', element: <PortInspectorPageMain /> },
      { path: 'launch-groups', element: <LaunchGroupPageMain /> },
      { path: 'history', element: <OperationHistoryPageMain /> },
      { path: 'settings/general', element: <GeneralSettingsPageMain /> },
      { path: 'settings/services', element: <ServiceSettingsPageMain /> },
      { path: 'settings/appearance', element: <AppearanceSettingsPageMain /> },
    ],
  },
])
