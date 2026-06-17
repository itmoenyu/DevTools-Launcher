export interface AppSettings {
  closeToTray: boolean
  launchOnStartup: boolean
  minimizeOnLaunch: boolean
  dataRetentionDays: number
  preferredTheme: 'dark' | 'light'
}

export interface DashboardSummary {
  totalServices: number
  runningServices: number
  occupiedPorts: number
  errorServices: number
}
