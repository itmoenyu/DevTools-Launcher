import { Alert, Button, Card, Input, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { useState } from 'react'

import ServiceRuntimeStatusIndicator from '@/components/common/ServiceRuntimeStatusIndicator'
import { inspectPorts, killProcessByPid } from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'
import {
  findServiceByPort,
  getServiceInstanceSourceExplanation,
  getServiceStatusPresentation,
} from '@/utils/serviceStatusPresentation'

export function PortInspectorPageMain() {
  const ports = useServiceStore((state) => state.ports)
  const services = useServiceStore((state) => state.services)
  const setPorts = useServiceStore((state) => state.setPorts)
  const [inputValue, setInputValue] = useState('3306,6379,8080,9000')
  const [messageApi, contextHolder] = message.useMessage()
  const [inspecting, setInspecting] = useState(false)
  const [killingPid, setKillingPid] = useState<number | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  async function handleInspect() {
    const numbers = [...new Set(
      inputValue
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0),
    )]

    if (!numbers.length) {
      const errorMessage = '请至少输入一个有效端口，多个端口请用英文逗号分隔。'
      setPageError(errorMessage)
      messageApi.error(errorMessage)
      return
    }

    setInspecting(true)
    setPageError(null)

    try {
      const result = await inspectPorts(numbers)
      setPorts(result)
      messageApi.success(`端口扫描完成，共检查 ${result.length} 个端口`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '端口扫描失败'
      setPageError(errorMessage)
      messageApi.error(errorMessage)
    } finally {
      setInspecting(false)
    }
  }

  async function handleKill(pid: number | null) {
    if (!pid) {
      return
    }

    setKillingPid(pid)
    setPageError(null)

    try {
      await killProcessByPid(pid)
      messageApi.success(`占用进程 PID ${pid} 已结束`)
      await handleInspect()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `结束 PID ${pid} 失败`
      setPageError(errorMessage)
      messageApi.error(errorMessage)
    } finally {
      setKillingPid(null)
    }
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
          <Button type="primary" loading={inspecting} onClick={() => void handleInspect()}>
            检查端口
          </Button>
        </Space>
      </div>
      <Alert
        type="info"
        showIcon
        className="glass-card"
        title="端口页会显式区分旧托管实例占用、当前托管实例占用和外部实例占用"
        description="如果某个端口被占着，页面会先判断占用 PID 是否与 Launcher 当前记录一致；如果是应用重启后恢复识别到的旧托管 PID，也会单独标成“旧托管实例占用”，避免和外部实例混在一起。"
      />
      {pageError ? (
        <Alert
          type="error"
          showIcon
          className="glass-card"
          title="最近一次端口操作失败"
          description={pageError}
        />
      ) : null}
      <Card className="glass-card table-card">
        <Table
          loading={inspecting}
          rowKey={(record) => record.port}
          dataSource={ports}
          columns={[
            { title: '端口', dataIndex: 'port' },
            {
              title: '关联服务',
              render: (_, record) => {
                const relatedService = findServiceByPort(record.port, services)
                return relatedService?.service.name ?? '未登记到服务列表'
              },
            },
            {
              title: '关联状态',
              render: (_, record) => {
                const relatedService = findServiceByPort(record.port, services)

                if (!relatedService) {
                  return <Tag>未关联</Tag>
                }

                return (
                  <ServiceRuntimeStatusIndicator
                    presentation={getServiceStatusPresentation(relatedService, ports)}
                  />
                )
              },
            },
            {
              title: '实例来源',
              render: (_, record) => {
                const relatedService = findServiceByPort(record.port, services)

                if (!relatedService) {
                  return (
                    <Tooltip title="这是端口扫描直接发现的现场实例，来源未知。">
                      <Tag>来源未知</Tag>
                    </Tooltip>
                  )
                }

                const sourceExplanation = getServiceInstanceSourceExplanation(relatedService, ports)

                return (
                  <Tooltip title={sourceExplanation.detail}>
                    <Tag color={sourceExplanation.tone === 'success' ? 'success' : sourceExplanation.tone === 'warning' ? 'warning' : 'default'}>
                      {sourceExplanation.label}
                    </Tag>
                  </Tooltip>
                )
              },
            },
            {
              title: '占用情况',
              render: (_, record) => {
                const relatedService = findServiceByPort(record.port, services)
                const sourceExplanation = relatedService
                  ? getServiceInstanceSourceExplanation(relatedService, ports)
                  : null

                return (
                  <Tag color={record.occupied ? 'error' : 'success'}>
                    {record.occupied
                      ? sourceExplanation?.code === 'managed_recovered'
                        ? '旧托管实例占用'
                        : sourceExplanation?.code === 'managed_current'
                          ? '当前托管实例占用'
                          : '外部实例占用'
                      : '空闲'}
                  </Tag>
                )
              },
            },
            { title: 'PID', dataIndex: 'pid' },
            { title: '进程名', dataIndex: 'processName' },
            { title: '路径', dataIndex: 'processPath' },
            {
              title: '操作',
              render: (_, record) =>
                record.occupied ? (
                  <Button
                    danger
                    size="small"
                    loading={killingPid === record.pid}
                    onClick={() => void handleKill(record.pid)}
                  >
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
