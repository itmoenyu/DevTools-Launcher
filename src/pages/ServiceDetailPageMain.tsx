import { Button, Card, Descriptions, Empty, Space, Spin, Tag, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  forceKillService,
  getServiceDetail,
  restartService,
  startService,
  stopService,
  queryLogs,
} from '@/services/tauri-api/client'
import { useAppStore } from '@/store/app-store'
import { useLogStore } from '@/store/log-store'
import { formatDateTime, formatDuration } from '@/utils/formatters'
import type { ServiceWithRuntime } from '@/types/service'

const actionTextMap = {
  start: '启动',
  stop: '停止',
  restart: '重启',
  kill: '强制结束',
} as const

export function ServiceDetailPageMain() {
  const navigate = useNavigate()
  const { serviceId } = useParams()
  const setSelectedServiceId = useAppStore((state) => state.setSelectedServiceId)
  const setActiveLogServiceId = useAppStore((state) => state.setActiveLogServiceId)
  const setLogs = useLogStore((state) => state.setLogs)
  const logsMap = useLogStore((state) => state.logs)
  const [messageApi, contextHolder] = message.useMessage()
  const [serviceDetail, setServiceDetail] = useState<ServiceWithRuntime | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<
    'start' | 'stop' | 'restart' | 'kill' | 'refresh' | null
  >(null)

  async function refreshDetail(currentServiceId: string) {
    setActionLoading('refresh')
    try {
      const [detail, logs] = await Promise.all([
        getServiceDetail(currentServiceId),
        queryLogs(currentServiceId),
      ])
      setServiceDetail(detail)
      setSelectedServiceId(detail.service.id)
      setActiveLogServiceId(detail.service.id)
      setLogs(detail.service.id, logs)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '刷新服务详情失败')
    } finally {
      setActionLoading(null)
    }
  }

  useEffect(() => {
    let active = true

    async function loadDetail() {
      if (!serviceId) {
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const [detail, logs] = await Promise.all([getServiceDetail(serviceId), queryLogs(serviceId)])
        if (!active) {
          return
        }

        setServiceDetail(detail)
        setSelectedServiceId(detail.service.id)
        setActiveLogServiceId(detail.service.id)
        setLogs(detail.service.id, logs)
      } catch (error) {
        if (!active) {
          return
        }

        setServiceDetail(null)
        messageApi.error(
          error instanceof Error ? error.message : '服务详情加载失败，请返回服务列表后重试',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [messageApi, serviceId, setActiveLogServiceId, setLogs, setSelectedServiceId])

  async function handleAction(action: 'start' | 'stop' | 'restart' | 'kill') {
    if (!serviceDetail) {
      return
    }

    setActionLoading(action)
    try {
      if (action === 'start') {
        await startService(serviceDetail.service.id)
      }

      if (action === 'stop') {
        await stopService(serviceDetail.service.id)
      }

      if (action === 'restart') {
        await restartService(serviceDetail.service.id)
      }

      if (action === 'kill') {
        await forceKillService(serviceDetail.service.id)
      }

      messageApi.success(`已触发${actionTextMap[action]}操作`)
      await refreshDetail(serviceDetail.service.id)
    } finally {
      setActionLoading(null)
    }
  }

  const latestLogs = useMemo(() => {
    if (!serviceDetail) {
      return []
    }

    return (logsMap[serviceDetail.service.id] ?? []).slice(-8).reverse()
  }, [logsMap, serviceDetail])

  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (!serviceId || !serviceDetail) {
    return (
      <Empty
        description="没有找到对应的服务，请返回服务列表重新选择。"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      >
        <Button type="primary" onClick={() => navigate('/services')}>
          返回服务管理
        </Button>
      </Empty>
    )
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {serviceDetail.service.name}
          </Typography.Title>
          <Typography.Text type="secondary">
            查看服务配置、实时状态、最近日志和进程信息。
          </Typography.Text>
        </div>
        <Space>
          <Button loading={actionLoading === 'refresh'} onClick={() => void refreshDetail(serviceId)}>
            刷新
          </Button>
          <Button loading={actionLoading === 'start'} onClick={() => void handleAction('start')}>
            启动
          </Button>
          <Button loading={actionLoading === 'stop'} onClick={() => void handleAction('stop')}>
            停止
          </Button>
          <Button loading={actionLoading === 'restart'} onClick={() => void handleAction('restart')}>
            重启
          </Button>
          <Button danger loading={actionLoading === 'kill'} onClick={() => void handleAction('kill')}>
            强制结束
          </Button>
        </Space>
      </div>
      <Card className="glass-card table-card">
        <Space style={{ marginBottom: 16 }} wrap>
          <Tag color={serviceDetail.runtime.status === 'running' ? 'success' : 'default'}>
            当前状态：{serviceDetail.runtime.status}
          </Tag>
          <Tag color="blue">服务类型：{serviceDetail.service.serviceType}</Tag>
          <Tag>PID：{serviceDetail.runtime.pid ?? '--'}</Tag>
          <Tag>端口：{serviceDetail.service.port ?? '--'}</Tag>
        </Space>
        <Descriptions
          bordered
          column={2}
          items={[
            { key: 'name', label: '服务名称', children: serviceDetail.service.name },
            { key: 'type', label: '服务类型', children: serviceDetail.service.serviceType },
            { key: 'exec', label: '可执行文件', children: serviceDetail.service.execPath },
            { key: 'dir', label: '工作目录', children: serviceDetail.service.workDir },
            { key: 'port', label: '服务端口', children: serviceDetail.service.port ?? '--' },
            { key: 'pid', label: '运行 PID', children: serviceDetail.runtime.pid ?? '--' },
            { key: 'status', label: '当前状态', children: serviceDetail.runtime.status },
            {
              key: 'duration',
              label: '运行时长',
              children: formatDuration(serviceDetail.runtime.startedAt),
            },
            {
              key: 'startedAt',
              label: '启动时间',
              children: formatDateTime(serviceDetail.runtime.startedAt),
            },
            {
              key: 'stoppedAt',
              label: '停止时间',
              children: formatDateTime(serviceDetail.runtime.stoppedAt),
            },
            {
              key: 'heartbeat',
              label: '最近心跳',
              children: formatDateTime(serviceDetail.runtime.lastHeartbeatAt),
            },
            {
              key: 'args',
              label: '启动参数',
              children: serviceDetail.service.args.join(' ') || '--',
            },
            {
              key: 'stopStrategy',
              label: '停止策略',
              children: serviceDetail.service.stopStrategy,
            },
            {
              key: 'healthcheckStrategy',
              label: '健康检查',
              children: serviceDetail.service.healthcheckStrategy,
            },
            {
              key: 'desc',
              label: '备注说明',
              children: serviceDetail.service.description || '--',
            },
          ]}
        />
      </Card>
      <Card className="glass-card table-card" title="最近日志">
        {latestLogs.length ? (
          <div className="log-console" style={{ height: 280 }}>
            {latestLogs.map((item) => (
              <p key={item.id} className="log-line mono-text">
                [{formatDateTime(item.createdAt)}] [{item.streamType}] {item.content}
              </p>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前还没有日志记录" />
        )}
      </Card>
    </Space>
  )
}

export default ServiceDetailPageMain
