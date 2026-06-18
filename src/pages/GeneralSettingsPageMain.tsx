import { Alert, Button, Card, Form, InputNumber, Space, Switch, Typography, message } from 'antd'

import { updateAppSettings } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'

export function GeneralSettingsPageMain() {
  const settings = useServiceStore((state) => state.settings)
  const setSettings = useServiceStore((state) => state.setSettings)
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  async function handleSave() {
    const values = await form.validateFields()
    // `closeToTray` 已经变成桌面端固定规则，这里显式写回 true，
    // 避免旧数据或表单缓存把它误保存成 false。
    const saved = await updateAppSettings({
      ...(settings ?? {}),
      ...values,
      closeToTray: true,
    })
    setSettings(saved)
    messageApi.success('通用设置已保存')
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
            配置单实例常驻托盘、开机启动、启动后最小化和数据保留天数。
          </Typography.Text>
        </div>
        <Button type="primary" onClick={() => void handleSave()}>
          保存设置
        </Button>
      </div>
      <Card className="glass-card form-card">
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="生命周期说明"
          description="Launcher 现在固定为单实例桌面程序：重复双击启动时会唤醒已打开的主窗口；点击右上角 X 只会隐藏到托盘；只有托盘菜单里的“退出应用”才会真正结束进程。应用启动后自动最小化：决定 Launcher 启动后是否直接隐藏主窗口。开机自动启动 Launcher：当前版本先保存该偏好，暂未接入 Windows 开机自启注册。"
        />
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
          <Form.Item name="dataRetentionDays" label="日志和历史保留天数">
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Card>
    </Space>
  )
}

export default GeneralSettingsPageMain
