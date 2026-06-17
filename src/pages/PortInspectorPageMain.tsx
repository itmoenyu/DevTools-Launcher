import { Button, Card, Input, Space, Table, Tag, Typography, message } from 'antd'
import { useState } from 'react'

import { inspectPorts, killProcessByPid } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'

export function PortInspectorPageMain() {
  const ports = useServiceStore((state) => state.ports)
  const setPorts = useServiceStore((state) => state.setPorts)
  const [inputValue, setInputValue] = useState('3306,6379,8080,9000')
  const [messageApi, contextHolder] = message.useMessage()

  async function handleInspect() {
    const numbers = inputValue
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0)

    const result = await inspectPorts(numbers)
    setPorts(result)
    messageApi.success('端口扫描完成')
  }

  async function handleKill(pid: number | null) {
    if (!pid) {
      return
    }

    await killProcessByPid(pid)
    messageApi.success('占用进程已结束')
    await handleInspect()
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            端口管理
          </Typography.Title>
          <Typography.Text type="secondary">
            在启动服务前先发现端口冲突，必要时直接结束占用进程。
          </Typography.Text>
        </div>
        <Space>
          <Input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            style={{ width: 320 }}
            placeholder="多个端口请用英文逗号分隔"
          />
          <Button type="primary" onClick={() => void handleInspect()}>
            检查端口
          </Button>
        </Space>
      </div>
      <Card className="glass-card table-card">
        <Table
          rowKey={(record) => record.port}
          dataSource={ports}
          columns={[
            { title: '端口', dataIndex: 'port' },
            {
              title: '占用情况',
              render: (_, record) => (
                <Tag color={record.occupied ? 'error' : 'success'}>
                  {record.occupied ? '已占用' : '空闲'}
                </Tag>
              ),
            },
            { title: 'PID', dataIndex: 'pid' },
            { title: '进程名', dataIndex: 'processName' },
            { title: '路径', dataIndex: 'processPath' },
            {
              title: '操作',
              render: (_, record) =>
                record.occupied ? (
                  <Button danger size="small" onClick={() => void handleKill(record.pid)}>
                    结束占用
                  </Button>
                ) : (
                  '--'
                ),
            },
          ]}
        />
      </Card>
    </Space>
  )
}

export default PortInspectorPageMain
