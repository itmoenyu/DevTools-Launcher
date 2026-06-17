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
    const saved = await updateAppSettings(values)
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
            配置托盘行为、开机启动、启动后最小化和数据保留天数。
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
          description="关闭窗口时最小化到托盘：决定点右上角 X 是隐藏到托盘还是执行真正退出。应用启动后自动最小化：决定 Launcher 启动后是否直接隐藏主窗口。开机自动启动 Launcher：当前版本先保存该偏好，暂未接入 Windows 开机自启注册。"
        />
        <Form
          layout="vertical"
          form={form}
          initialValues={settings ?? undefined}
          key={JSON.stringify(settings ?? {})}
        >
          <Form.Item
            name="closeToTray"
            label="关闭窗口时最小化到托盘"
            valuePropName="checked"
            extra="开启后，点击主窗口右上角关闭按钮只会隐藏到托盘，已托管服务继续保留；关闭后，点击关闭按钮会进入真正退出流程。"
          >
            <Switch />
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
