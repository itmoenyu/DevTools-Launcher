import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useEffect, useRef, useState } from 'react'

export type DesktopUpdaterStage =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'relaunching'
  | 'error'

interface DesktopUpdaterState {
  stage: DesktopUpdaterStage
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string
  errorMessage: string | null
  downloadProgress: number | null
  lastCheckedAt: string | null
}

const initialState: DesktopUpdaterState = {
  stage: 'idle',
  currentVersion: '--',
  latestVersion: null,
  releaseNotes: '',
  errorMessage: null,
  downloadProgress: null,
  lastCheckedAt: null,
}

function normalizeReleaseNotes(value?: string) {
  const trimmed = value?.trim()
  return trimmed || '更新服务器没有提供更新说明。'
}

function translateUpdaterError(error: unknown) {
  const fallback = '检查更新失败，请稍后重试。'

  if (!(error instanceof Error)) {
    return fallback
  }

  const rawMessage = error.message.trim()
  const normalizedMessage = rawMessage.toLowerCase()

  if (
    normalizedMessage.includes('builder configured without endpoints')
    || (normalizedMessage.includes('endpoint') && normalizedMessage.includes('config'))
  ) {
    return '更新服务器地址未配置，请先在 src-tauri/tauri.conf.json 的 plugins.updater.endpoints 中填写可访问的更新地址。'
  }

  if (normalizedMessage.includes('pubkey') || normalizedMessage.includes('signature')) {
    return '更新签名校验配置不完整，请检查 src-tauri/tauri.conf.json 里的 plugins.updater.pubkey，以及服务端返回的签名内容是否正确。'
  }

  if (normalizedMessage.includes('404')) {
    return '更新服务器没有找到版本清单，请确认 latest.json 或动态更新接口地址是否正确。'
  }

  if (normalizedMessage.includes('403') || normalizedMessage.includes('401')) {
    return '更新服务器拒绝了当前请求，请检查下载地址权限、鉴权配置或访问令牌。'
  }

  if (normalizedMessage.includes('timeout')) {
    return '连接更新服务器超时，请检查当前网络、代理设置或更新服务响应是否过慢。'
  }

  if (
    normalizedMessage.includes('dns')
    || normalizedMessage.includes('network')
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('connection')
  ) {
    return '无法连接更新服务器，请确认网络可用，并检查更新地址是否可以从当前电脑访问。'
  }

  if (
    normalizedMessage.includes('json')
    || normalizedMessage.includes('deserialize')
    || normalizedMessage.includes('invalid type')
  ) {
    return '更新清单格式不正确，请检查更新服务器返回的 latest.json 结构是否符合 Tauri Updater 要求。'
  }

  if (normalizedMessage.includes('unsupported')) {
    return '当前更新包格式不受支持，请检查服务器上发布的安装包类型是否与当前平台匹配。'
  }

  return rawMessage || fallback
}

export function useDesktopUpdaterController() {
  const [state, setState] = useState<DesktopUpdaterState>(initialState)
  const updateRef = useRef<Update | null>(null)

  const clearHeldUpdate = useCallback(async () => {
    if (!updateRef.current) {
      return
    }

    try {
      await updateRef.current.close()
    } catch {
      // 这里只做资源释放，失败也不影响主流程，所以静默吞掉。
    } finally {
      updateRef.current = null
    }
  }, [])

  const readCurrentVersion = useCallback(async () => {
    try {
      const version = await getVersion()
      setState((previous) => ({ ...previous, currentVersion: version }))
      return version
    } catch {
      return '--'
    }
  }, [])

  const checkForUpdates = useCallback(async () => {
    const currentVersion = await readCurrentVersion()

    setState((previous) => ({
      ...previous,
      stage: 'checking',
      currentVersion,
      errorMessage: null,
      downloadProgress: null,
    }))

    await clearHeldUpdate()

    try {
      const pendingUpdate = await check({ timeout: 15000 })
      const checkedAt = new Date().toISOString()

      if (!pendingUpdate) {
        setState((previous) => ({
          ...previous,
          stage: 'latest',
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: '',
          errorMessage: null,
          downloadProgress: null,
          lastCheckedAt: checkedAt,
        }))
        return
      }

      updateRef.current = pendingUpdate

      setState((previous) => ({
        ...previous,
        stage: 'available',
        currentVersion: pendingUpdate.currentVersion || currentVersion,
        latestVersion: pendingUpdate.version,
        releaseNotes: normalizeReleaseNotes(pendingUpdate.body),
        errorMessage: null,
        downloadProgress: null,
        lastCheckedAt: checkedAt,
      }))
    } catch (error) {
      setState((previous) => ({
        ...previous,
        stage: 'error',
        currentVersion,
        latestVersion: null,
        releaseNotes: '',
        errorMessage: translateUpdaterError(error),
        downloadProgress: null,
        lastCheckedAt: new Date().toISOString(),
      }))
    }
  }, [clearHeldUpdate, readCurrentVersion])

  const installUpdateAndRestart = useCallback(async () => {
    const pendingUpdate = updateRef.current

    if (!pendingUpdate) {
      setState((previous) => ({
        ...previous,
        stage: 'error',
        errorMessage: '没有可安装的更新，请先点击“检查更新”获取最新版本信息。',
      }))
      return
    }

    let totalBytes: number | undefined
    let downloadedBytes = 0

    try {
      setState((previous) => ({
        ...previous,
        stage: 'downloading',
        errorMessage: null,
        downloadProgress: 0,
      }))

      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength
          downloadedBytes = 0
          setState((previous) => ({
            ...previous,
            stage: 'downloading',
            downloadProgress: 0,
          }))
          return
        }

        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          const progress =
            totalBytes && totalBytes > 0
              ? Math.min(Math.round((downloadedBytes / totalBytes) * 100), 100)
              : null

          setState((previous) => ({
            ...previous,
            stage: 'downloading',
            downloadProgress: progress,
          }))
          return
        }

        setState((previous) => ({
          ...previous,
          stage: 'installing',
          downloadProgress: 100,
        }))
      }, { timeout: 10 * 60 * 1000 })

      await clearHeldUpdate()

      setState((previous) => ({
        ...previous,
        stage: 'relaunching',
        downloadProgress: 100,
      }))

      await relaunch()
    } catch (error) {
      await clearHeldUpdate()

      setState((previous) => ({
        ...previous,
        stage: 'error',
        errorMessage: translateUpdaterError(error),
        downloadProgress: null,
      }))
    }
  }, [clearHeldUpdate])

  useEffect(() => {
    void readCurrentVersion()

    return () => {
      void clearHeldUpdate()
    }
  }, [clearHeldUpdate, readCurrentVersion])

  return {
    ...state,
    checkForUpdates,
    installUpdateAndRestart,
    isChecking: state.stage === 'checking',
    isInstalling:
      state.stage === 'downloading'
      || state.stage === 'installing'
      || state.stage === 'relaunching',
    canInstall: state.stage === 'available',
  }
}

export default useDesktopUpdaterController
