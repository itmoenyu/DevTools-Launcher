export interface AppSettings {
  closeToTray: boolean
  launchOnStartup: boolean
  minimizeOnLaunch: boolean
  dataRetentionDays: number
  preferredTheme: 'dark' | 'light'
  autoUpdateEnabled: boolean
}

export interface DashboardSummary {
  totalServices: number
  runningServices: number
  occupiedPorts: number
  errorServices: number
}
