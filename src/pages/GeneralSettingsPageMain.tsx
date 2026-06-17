import { Button, Card, Form, InputNumber, Space, Switch, Typography, message } from 'antd'

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
        <Form
          layout="vertical"
          form={form}
          initialValues={settings ?? undefined}
          key={JSON.stringify(settings ?? {})}
        >
          <Form.Item name="closeToTray" label="关闭窗口时最小化到托盘" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="launchOnStartup" label="开机自动启动 Launcher" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="minimizeOnLaunch" label="应用启动后自动最小化" valuePropName="checked">
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
