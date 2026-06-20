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

import { useUpdater } from '@/app/useUpdater'
import { updateAppSettings } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'
import { formatDateTime } from '@/utils/formatters'

export function GeneralSettingsPageMain() {
  const settings = useServiceStore((state) => state.settings)
  const setSettings = useServiceStore((state) => state.setSettings)
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  // 消费全局更新状态机（App.tsx 启动检查 + Toast 通知 / 设置页手动检查）
  const {
    currentVersion,
    latestVersion,
    releaseNotes,
    downloadProgress,
    lastCheckedAt,
    isChecking,
    isInstalling,
    canInstall,
    checkForUpdates,
    installUpdateAndRestart,
  } = useUpdater()

  async function handleSave() {
    const values = await form.validateFields()
    const saved = await updateAppSettings({
      ...(settings ?? {}),
      ...values,
    })
    setSettings(saved)
    messageApi.success('通用设置已保存')
  }

  async function handleManualCheck() {
    // 手动检查时，让设置页 UI 完全接管：发现新版本后不自动后台下载，
    // 而是走 installUpdateAndRestart 一条龙（下载 + 安装 + 重启）。
    messageApi.info('正在检查更新...')
    await checkForUpdates()
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
          initialValues={settings ?? undefined}
          key={JSON.stringify(settings ?? {})}
        >

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
            extra="开启后，应用启动时会自动在后台检查新版本，发现更新会静默下载，下载完成后通过右下角提示您重启安装。"
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
              {releaseNotes || settings?.latestReleaseNotes || '暂无更新'}
            </Typography.Paragraph>
          </div>
        </Space>
      </Card>
    </Space>
  )
}

export default GeneralSettingsPageMain