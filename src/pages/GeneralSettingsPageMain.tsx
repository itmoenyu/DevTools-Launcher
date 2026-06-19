import {
  Button,
  Card,
  Descriptions,
  Form,
  InputNumber,
  Progress,
  Space,
  Switch,
  Typography,
  message,
} from 'antd'
import { useEffect, useRef, useState } from 'react'

import { UpdateAvailableModal } from '@/components/update/UpdateAvailableModal'
import useDesktopUpdaterController from '@/hooks/useDesktopUpdaterController'
import { updateAppSettings } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'
import { formatDateTime } from '@/utils/formatters'

export function GeneralSettingsPageMain() {
  const settings = useServiceStore((state) => state.settings)
  const setSettings = useServiceStore((state) => state.setSettings)
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()
  const autoCheckedRef = useRef(false)
  const [dismissed, setDismissed] = useState(false)

  const {
    stage,
    currentVersion,
    latestVersion,
    releaseNotes,
    errorMessage,
    downloadProgress,
    lastCheckedAt,
    isChecking,
    isInstalling,
    canInstall,
    checkForUpdates,
    installUpdateAndRestart,
  } = useDesktopUpdaterController()

  // 在设置页挂载时，如果启用了自动更新，自动检查一次
  useEffect(() => {
    if (autoCheckedRef.current) return
    if (!settings) return
    if (!settings.autoUpdateEnabled) {
      autoCheckedRef.current = true
      return
    }
    autoCheckedRef.current = true
    checkForUpdates()
  }, [settings, checkForUpdates])

  const modalOpen = stage === 'available' && !dismissed

  // 非 idle 阶段变化时，用 Toast 展示状态
  useEffect(() => {
    if (stage === 'idle') return

    const toastMap: Record<string, { type: 'success' | 'info' | 'warning' | 'error'; text: string }> = {
      checking: { type: 'info', text: '正在检查更新...' },
      latest: { type: 'success', text: `当前已是最新版 v${currentVersion}` },
      available: { type: 'warning', text: `发现新版本 v${latestVersion ?? '--'}` },
      downloading: { type: 'info', text: '正在下载更新包...' },
      installing: { type: 'info', text: '正在安装更新...' },
      relaunching: { type: 'success', text: '更新安装完成，正在重启...' },
      error: { type: 'error', text: errorMessage ?? '检查更新失败，请稍后重试。' },
    }

    const toastConfig = toastMap[stage]
    if (toastConfig) {
      messageApi[toastConfig.type](toastConfig.text)
    }
  }, [stage, currentVersion, latestVersion, errorMessage, messageApi])

  async function handleSave() {
    const values = await form.validateFields()
    const saved = await updateAppSettings({
      ...(settings ?? {}),
      ...values,
      closeToTray: true,
    })
    setSettings(saved)
    messageApi.success('通用设置已保存')
  }

  async function handleManualCheck() {
    setDismissed(false)
    autoCheckedRef.current = true
    checkForUpdates()
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            通用设置
          </Typography.Title>
          <Typography.Text type="secondary">
            配置常驻托盘、开机启动、启动后最小化、自动更新和数据保留天数。
          </Typography.Text>
        </div>
        <Button type="primary" onClick={() => void handleSave()}>
          保存设置
        </Button>
      </div>
      <Card className="glass-card form-card">
        <Form
          layout="vertical"
          form={form}
          initialValues={settings ? { ...settings, closeToTray: true } : undefined}
          key={JSON.stringify(settings ? { ...settings, closeToTray: true } : {})}
        >
          <Form.Item
            name="closeToTray"
            label="关闭窗口时最小化到托盘"
            valuePropName="checked"
            extra="该行为已固定启用，点击主窗口右上角关闭按钮时只会隐藏到托盘，避免误关后把整个 Launcher 进程退出。"
          >
            <Switch disabled />
          </Form.Item>
          <Form.Item
            name="launchOnStartup"
            label="开机自动启动 Launcher"
            valuePropName="checked"
            extra="当前版本先保存这个偏好设置，方便后续接入系统级开机自启；现在还不会自动修改 Windows 的开机启动项。"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="minimizeOnLaunch"
            label="应用启动后自动最小化"
            valuePropName="checked"
            extra="开启后，Launcher 启动完成会直接隐藏主窗口，适合需要常驻托盘但不希望每次都弹出主界面的场景。"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="autoUpdateEnabled"
            label="启用自动更新"
            valuePropName="checked"
            extra="开启后，打开此设置页面时将自动检查新版本。发现新版本时弹出更新提示，可选择立即更新或稍后再说。"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="dataRetentionDays" label="日志和历史保留天数">
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Card>
      <Card className="glass-card form-card">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="page-toolbar update-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                检查更新
              </Typography.Title>
              <Typography.Text type="secondary">
                手动从更新服务器检查新版本，发现新版本后支持一键下载安装并自动重启。
              </Typography.Text>
            </div>
            <Space wrap>
              <Button loading={isChecking} disabled={isInstalling} onClick={() => void handleManualCheck()}>
                检查更新
              </Button>
              <Button
                type="primary"
                loading={isInstalling}
                disabled={!canInstall}
                onClick={() => void installUpdateAndRestart()}
              >
                立即更新
              </Button>
            </Space>
          </div>

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="当前版本">{`v${currentVersion}`}</Descriptions.Item>
            <Descriptions.Item label="最新版本">
              {latestVersion ? `v${latestVersion}` : '尚未获取'}
            </Descriptions.Item>
            <Descriptions.Item label="最近检查时间">
              {lastCheckedAt ? formatDateTime(lastCheckedAt) : '--'}
            </Descriptions.Item>
          </Descriptions>

          {typeof downloadProgress === 'number' ? (
            <div>
              <Typography.Text type="secondary">下载进度</Typography.Text>
              <Progress percent={downloadProgress} status="active" style={{ marginTop: 8 }} />
            </div>
          ) : null}

          <div className="update-release-notes-block">
            <Typography.Text strong>更新说明</Typography.Text>
            <Typography.Paragraph className="update-release-notes">
              {releaseNotes || '暂无更新'}
            </Typography.Paragraph>
          </div>
        </Space>
      </Card>

      <UpdateAvailableModal
        open={modalOpen}
        stage={stage}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        releaseNotes={releaseNotes}
        downloadProgress={downloadProgress}
        isInstalling={isInstalling}
        canInstall={canInstall}
        onInstall={() => installUpdateAndRestart()}
        onCancel={() => { setDismissed(true) }}
      />
    </Space>
  )
}

export default GeneralSettingsPageMain
