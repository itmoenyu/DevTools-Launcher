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
  // 后台静默下载已完成，等待用户确认后重启安装
  | 'downloaded'
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

const GITHUB_RELEASE_API_URL =
  'https://api.github.com/repos/itmoenyu/DevTools-Launcher/releases/latest'

interface GithubLatestReleasePayload {
  tag_name?: string
  body?: string
  published_at?: string
}

function normalizeReleaseNotes(value?: string) {
  const trimmed = value?.trim()
  return trimmed || '更新服务器没有提供更新说明。'
}

function normalizeReleaseVersion(tagName?: string) {
  return tagName?.trim().replace(/^v/i, '') || null
}

function resolveReleaseNotes(update: Update, release?: GithubLatestReleasePayload | null) {
  const rawNotes = update.rawJson?.notes
  const rawBody = update.rawJson?.body
  // 优先使用 GitHub Releases API 的 release.body：workflow 每次成功执行都会
  // 覆盖 GitHub Release 上的 body，是真正的最新值。
  // update.body / rawJson.notes / rawJson.body 都来自 latest.json，
  // tauri-action 只在发布那一刻写入一次，且容易被 CDN 缓存，
  // 当同一个 tag 连续触发多次 workflow 时会拿到陈旧的 commit list。
  const normalized =
    release?.body
    || update.body
    || (typeof rawNotes === 'string' ? rawNotes : undefined)
    || (typeof rawBody === 'string' ? rawBody : undefined)

  return normalizeReleaseNotes(normalized)
}

async function fetchLatestReleaseMetadata() {
  try {
    const response = await fetch(GITHUB_RELEASE_API_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as GithubLatestReleasePayload
    return payload
  } catch {
    return null
  }
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

  if (normalizedMessage.includes('error sending request')) {
    return '无法访问更新服务器。请检查网络连接，或确认 GitHub Releases 是否已发布并上传了更新清单。'
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
  // 下载进度累计用的总量/已下载字节，供 downloadUpdate 与 installUpdateAndRestart 共用。
  const totalBytesRef = useRef<number | undefined>(undefined)
  const downloadedBytesRef = useRef<number>(0)

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
      const [pendingUpdate, latestRelease] = await Promise.all([
        check({ timeout: 15000 }),
        fetchLatestReleaseMetadata(),
      ])
      const checkedAt = new Date().toISOString()

      if (!pendingUpdate) {
        setState((previous) => ({
          ...previous,
          stage: 'latest',
          currentVersion,
          latestVersion: normalizeReleaseVersion(latestRelease?.tag_name) || currentVersion,
          releaseNotes: normalizeReleaseNotes(latestRelease?.body),
          errorMessage: null,
          downloadProgress: null,
          lastCheckedAt: latestRelease?.published_at || checkedAt,
        }))
        return
      }

      updateRef.current = pendingUpdate

      setState((previous) => ({
        ...previous,
        stage: 'available',
        currentVersion: pendingUpdate.currentVersion || currentVersion,
        latestVersion: normalizeReleaseVersion(latestRelease?.tag_name) || pendingUpdate.version,
        releaseNotes: resolveReleaseNotes(pendingUpdate, latestRelease),
        errorMessage: null,
        downloadProgress: null,
        lastCheckedAt: latestRelease?.published_at || checkedAt,
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

  // 把下载进度事件转成 setState，downloading/installing 两个流程共用。
  // 注意：tauri-plugin-updater 的终态事件名是 'Finished'（不是 'Done'）。
  const buildDownloadProgressHandler = useCallback(
    (onFinished: () => void) => (event: DownloadEvent) => {
      if (event.event === 'Started') {
        totalBytesRef.current = event.data.contentLength
        downloadedBytesRef.current = 0
        setState((previous) => ({
          ...previous,
          stage: 'downloading',
          downloadProgress: 0,
        }))
        return
      }

      if (event.event === 'Progress') {
        downloadedBytesRef.current += event.data.chunkLength
        const total = totalBytesRef.current
        const progress =
          total && total > 0
            ? Math.min(Math.round((downloadedBytesRef.current / total) * 100), 100)
            : null

        setState((previous) => ({
          ...previous,
          stage: 'downloading',
          downloadProgress: progress,
        }))
        return
      }

      // event.event === 'Finished'
      onFinished()
    },
    [],
  )

  // 仅下载更新包到本地，不安装、不重启。用于后台静默下载，
  // 下载完成后进入 'downloaded' 状态，等待用户通过 restartToUpdate 确认重启。
  const downloadUpdate = useCallback(async () => {
    const pendingUpdate = updateRef.current

    if (!pendingUpdate) {
      setState((previous) => ({
        ...previous,
        stage: 'error',
        errorMessage: '没有可下载的更新，请先点击“检查更新”获取最新版本信息。',
      }))
      return
    }

    try {
      setState((previous) => ({
        ...previous,
        stage: 'downloading',
        errorMessage: null,
        downloadProgress: 0,
      }))

      await pendingUpdate.download(
        buildDownloadProgressHandler(() => {
          setState((previous) => ({
            ...previous,
            stage: 'downloaded',
            downloadProgress: 100,
          }))
        }),
        { timeout: 10 * 60 * 1000 },
      )
    } catch (error) {
      await clearHeldUpdate()
      setState((previous) => ({
        ...previous,
        stage: 'error',
        errorMessage: translateUpdaterError(error),
        downloadProgress: null,
      }))
    }
  }, [buildDownloadProgressHandler, clearHeldUpdate])

  // 安装已下载的更新包并重启。配合 downloadUpdate 使用：
  // 后台下载完成 → Toast 提示 → 用户点击重启 → 调本方法。
  const restartToUpdate = useCallback(async () => {
    const pendingUpdate = updateRef.current

    if (!pendingUpdate) {
      setState((previous) => ({
        ...previous,
        stage: 'error',
        errorMessage: '更新未就绪，请重新检查更新。',
      }))
      return
    }

    try {
      setState((previous) => ({
        ...previous,
        stage: 'installing',
        downloadProgress: 100,
      }))

      await pendingUpdate.install()
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

    try {
      setState((previous) => ({
        ...previous,
        stage: 'downloading',
        errorMessage: null,
        downloadProgress: 0,
      }))

      // downloadAndInstall 下载完成后会自动进入安装阶段，Finished 事件触发即开始安装。
      await pendingUpdate.downloadAndInstall(
        buildDownloadProgressHandler(() => {
          setState((previous) => ({
            ...previous,
            stage: 'installing',
            downloadProgress: 100,
          }))
        }),
        { timeout: 10 * 60 * 1000 },
      )

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
  }, [buildDownloadProgressHandler, clearHeldUpdate])

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
    downloadUpdate,
    restartToUpdate,
    isChecking: state.stage === 'checking',
    isDownloading: state.stage === 'downloading',
    isInstalling:
      state.stage === 'installing'
      || state.stage === 'relaunching',
    canInstall: state.stage === 'available',
    // 已下载完成、等待用户确认重启（用于 Toast“立即重启”按钮可用态）
    canRestart: state.stage === 'downloaded',
  }
}

export default useDesktopUpdaterController
