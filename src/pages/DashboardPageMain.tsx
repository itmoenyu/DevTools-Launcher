import { Button, Card, Col, Row, Space, Statistic, Table, Typography, message } from 'antd'
import { useMemo } from 'react'

import { inspectPorts, startService, stopService } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'
import { formatDateTime } from '@/utils/formatters'

const commonPorts = [3306, 6379, 8080, 9000]

export function DashboardPageMain() {
  const services = useServiceStore((state) => state.services)
  const history = useServiceStore((state) => state.history)
  const ports = useServiceStore((state) => state.ports)
  const setPorts = useServiceStore((state) => state.setPorts)
  const [messageApi, contextHolder] = message.useMessage()

  const summary = useMemo(() => {
    const runningServices = services.filter((item) => item.runtime.status === 'running').length
    const errorServices = services.filter((item) => item.runtime.status === 'error').length
    const occupiedPorts = ports.filter((item) => item.occupied).length

    return {
      totalServices: services.length,
      runningServices,
      errorServices,
      occupiedPorts,
    }
  }, [ports, services])

  async function refreshPorts() {
    const result = await inspectPorts(commonPorts)
    setPorts(result)
    messageApi.success('常用端口扫描完成')
  }

  async function startAllServices() {
    try {
      await Promise.all(services.map((item) => startService(item.service.id)))
      messageApi.success('全部启动成功')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '批量启动失败')
    }
  }

  async function stopAllServices() {
    try {
      await Promise.all(services.map((item) => stopService(item.service.id)))
      messageApi.success('全部停止成功')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '批量停止失败')
    }
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            仪表盘
          </Typography.Title>
          <Typography.Text type="secondary">
            用一屏视图掌握服务状态、端口占用和最近操作。
          </Typography.Text>
        </div>
        <Space>
          <Button onClick={() => void refreshPorts()}>扫描端口</Button>
          <Button type="primary" onClick={() => void startAllServices()}>
            启动全部
          </Button>
          <Button danger onClick={() => void stopAllServices()}>
            停止全部
          </Button>
        </Space>
      </div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="服务总数" value={summary.totalServices} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="运行中服务" value={summary.runningServices} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="端口占用数" value={summary.occupiedPorts} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="异常服务" value={summary.errorServices} />
          </Card>
        </Col>
      </Row>
      <div className="grid-two">
        <Card className="glass-card table-card" title="服务快照">
          <Table
            rowKey={(record) => record.service.id}
            pagination={false}
            dataSource={services}
            columns={[
              { title: '服务', dataIndex: ['service', 'name'] },
              { title: '类型', dataIndex: ['service', 'serviceType'] },
              { title: '端口', render: (_, record) => record.service.port ?? '--' },
              { title: 'PID', render: (_, record) => record.runtime.pid ?? '--' },
              { title: '状态', render: (_, record) => record.runtime.status },
            ]}
          />
        </Card>
        <Card className="glass-card table-card" title="最近活动">
          <div style={{ display: 'grid', gap: 12 }}>
            {history.slice(0, 6).map((item) => (
              <div key={item.id} className="glass-panel" style={{ padding: 12, borderRadius: 12 }}>
                <Typography.Text strong>
                  {item.serviceName} · {item.operationType} · {item.result}
                </Typography.Text>
                <div>
                  <Typography.Text type="secondary">
                    {item.message} · {formatDateTime(item.createdAt)}
                  </Typography.Text>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Space>
  )
}

export default DashboardPageMain
