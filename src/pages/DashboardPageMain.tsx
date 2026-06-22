import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tooltip, Typography, message } from 'antd'
import { useMemo, useState } from 'react'

import ServiceRuntimeStatusIndicator from '@/components/common/ServiceRuntimeStatusIndicator'
import { listListeningPorts, startService, stopService } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'
import { formatDateTime } from '@/utils/formatters'
import {
  getFriendlyServiceActionError,
  getServiceActionAvailability,
  getServiceInstanceSourceExplanation,
  getServiceStatusPresentation,
} from '@/utils/serviceStatusPresentation'

export function DashboardPageMain() {
  const services = useServiceStore((state) => state.services)
  const history = useServiceStore((state) => state.history)
  const ports = useServiceStore((state) => state.ports)
  const replacePorts = useServiceStore((state) => state.replacePorts)
  const [messageApi, contextHolder] = message.useMessage()
  const [refreshingPorts, setRefreshingPorts] = useState(false)
  const [batchAction, setBatchAction] = useState<'start' | 'stop' | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const presentations = services.map((item) => getServiceStatusPresentation(item, ports))
    const runningServices = presentations.filter((item) => item.code === 'running').length
    const errorServices = presentations.filter((item) => item.hasIssue).length
    const occupiedPorts = ports.filter((item) => item.occupied).length

    return {
      totalServices: services.length,
      runningServices,
      errorServices,
      occupiedPorts,
    }
  }, [ports, services])

  async function refreshPorts() {
    setRefreshingPorts(true)
    setPageError(null)

    try {
      const t0 = performance.now()
      const result = await listListeningPorts()
      const duration = Math.round(performance.now() - t0)
      replacePorts(result, duration)
      messageApi.success(`全量端口扫描完成，共 ${result.length} 个端口`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '端口扫描失败'
      setPageError(errorMessage)
      messageApi.error(errorMessage)
    } finally {
      setRefreshingPorts(false)
    }
  }

  async function startAllServices() {
    setBatchAction('start')
    setPageError(null)

    const candidates = services.filter(
      (item) => !getServiceActionAvailability(item, ports).startDisabled,
    )

    if (!candidates.length) {
      const errorMessage = '当前没有可以批量启动的服务。常见原因是服务已在运行、仍在切换状态，或配置还没补齐。'
      setPageError(errorMessage)
      messageApi.warning(errorMessage)
      setBatchAction(null)
      return
    }

    const results = await Promise.allSettled(candidates.map((item) => startService(item.service.id)))
    const failedResults = results.filter((item) => item.status === 'rejected')

    if (!failedResults.length) {
      messageApi.success(`批量启动完成，成功 ${results.length} 项`)
      setBatchAction(null)
      return
    }

    const firstError = getFriendlyServiceActionError('start', failedResults[0].reason)
    const errorMessage = `批量启动已完成：成功 ${results.length - failedResults.length} 项，失败 ${failedResults.length} 项。首个失败原因：${firstError}`
    setPageError(errorMessage)
    messageApi.error(errorMessage)
    setBatchAction(null)
  }

  async function stopAllServices() {
    setBatchAction('stop')
    setPageError(null)

    const candidates = services.filter(
      (item) => !getServiceActionAvailability(item, ports).stopDisabled,
    )

    if (!candidates.length) {
      const errorMessage = '当前没有可以批量停止的服务。只有已经被 Launcher 托管并记录到 PID 的实例，才能稳定执行批量停止。'
      setPageError(errorMessage)
      messageApi.warning(errorMessage)
      setBatchAction(null)
      return
    }

    const results = await Promise.allSettled(candidates.map((item) => stopService(item.service.id)))
    const failedResults = results.filter((item) => item.status === 'rejected')

    if (!failedResults.length) {
      messageApi.success(`批量停止完成，成功 ${results.length} 项`)
      setBatchAction(null)
      return
    }

    const firstError = getFriendlyServiceActionError('stop', failedResults[0].reason)
    const errorMessage = `批量停止已完成：成功 ${results.length - failedResults.length} 项，失败 ${failedResults.length} 项。首个失败原因：${firstError}`
    setPageError(errorMessage)
    messageApi.error(errorMessage)
    setBatchAction(null)
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
          <Button loading={refreshingPorts} onClick={() => void refreshPorts()}>
            扫描端口
          </Button>
          <Button type="primary" loading={batchAction === 'start'} onClick={() => void startAllServices()}>
            启动全部
          </Button>
          <Button danger loading={batchAction === 'stop'} onClick={() => void stopAllServices()}>
            停止全部
          </Button>
        </Space>
      </div>
      {pageError ? (
        <Alert
          type="error"
          showIcon
          className="glass-card"
          message="最近一次仪表盘操作失败"
          description={pageError}
        />
      ) : null}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="服务总数" value={summary.totalServices} />
            <Typography.Text type="secondary">
              已登记到 Launcher 的全部服务配置。
            </Typography.Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="运行中服务" value={summary.runningServices} />
            <Typography.Text type="secondary">
              托管记录与现场状态一致的运行实例。
            </Typography.Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="端口占用数" value={summary.occupiedPorts} />
            <Typography.Text type="secondary">
              当前被扫描到存在进程占用的端口数量。
            </Typography.Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="glass-card metric-card">
            <Statistic title="异常服务" value={summary.errorServices} />
            <Typography.Text type="secondary">
              包含端口冲突、异常状态等需要关注的问题。
            </Typography.Text>
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
              {
                title: '状态',
                render: (_, record) => {
                  const presentation = getServiceStatusPresentation(record, ports)

                  return (
                    <ServiceRuntimeStatusIndicator
                      presentation={presentation}
                    />
                  )
                },
              },
              {
                title: '实例来源',
                render: (_, record) => {
                  const sourceExplanation = getServiceInstanceSourceExplanation(record, ports)

                  return (
                    <Tooltip title={sourceExplanation.detail}>
                      <Typography.Text strong>{sourceExplanation.label}</Typography.Text>
                    </Tooltip>
                  )
                },
              },
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
            {!history.length ? (
              <Typography.Text type="secondary">
                还没有最近活动记录；后续启动、停止、重启或保存配置后，会按时间倒序展示在这里。
              </Typography.Text>
            ) : null}
          </div>
        </Card>
      </div>
    </Space>
  )
}

export default DashboardPageMain
