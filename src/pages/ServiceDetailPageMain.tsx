import { LoadingOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Empty, Space, Spin, Tag, Typography, message, Input } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import GlassTooltip from '@/components/common/GlassTooltip'
import ServiceRuntimeStatusIndicator from '@/components/common/ServiceRuntimeStatusIndicator'
import {
  forceKillService,
  getServiceDetail,
  inspectPorts,
  restartService,
  startService,
  stopService,
  queryLogs,
} from '@/services/tauri-api/client'
import { useAppStore } from '@/store/app-store'
import { useLogStore } from '@/store/log-store'
import { useServiceStore } from '@/store/service-store'
import { formatDateTime, formatDuration } from '@/utils/formatters'
import {
  getFriendlyServiceActionError,
  getServiceActionAvailability,
  getServiceInstanceSourceExplanation,
  getServiceLifecycleExplanation,
  getServiceStatusPresentation,
  mergePortInspectionItems,
} from '@/utils/serviceStatusPresentation'

const actionTextMap = {
  start: '启动',
  stop: '停止',
  restart: '重启',
  kill: '强制结束',
} as const

export function ServiceDetailPageMain() {
  const navigate = useNavigate()
  const { serviceId } = useParams()
  const services = useServiceStore((state) => state.services)
  const ports = useServiceStore((state) => state.ports)
  const upsertService = useServiceStore((state) => state.upsertService)
  const setPorts = useServiceStore((state) => state.setPorts)
  const setSelectedServiceId = useAppStore((state) => state.setSelectedServiceId)
  const setActiveLogServiceId = useAppStore((state) => state.setActiveLogServiceId)
  const setLogs = useLogStore((state) => state.setLogs)
  const logsMap = useLogStore((state) => state.logs)
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<
    'start' | 'stop' | 'restart' | 'kill' | 'refresh' | null
  >(null)
  const serviceDetail = useMemo(
    () => services.find((item) => item.service.id === serviceId) ?? null,
    [serviceId, services],
  )

  async function refreshDetail(currentServiceId: string) {
    setActionLoading('refresh')
    try {
      const [detail, logs] = await Promise.all([
        getServiceDetail(currentServiceId),
        queryLogs(currentServiceId),
      ])
      upsertService(detail)
      setLogs(detail.service.id, logs)

      if (detail.service.port !== null) {
        const latestPorts = await inspectPorts([detail.service.port])
        const currentPorts = useServiceStore.getState().ports
        setPorts(mergePortInspectionItems(currentPorts, latestPorts))
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新服务详情失败'
      messageApi.error(errorMessage)
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

        upsertService(detail)
        setLogs(detail.service.id, logs)

        if (detail.service.port !== null) {
          const latestPorts = await inspectPorts([detail.service.port])
          if (!active) {
            return
          }

          const currentPorts = useServiceStore.getState().ports
          setPorts(mergePortInspectionItems(currentPorts, latestPorts))
        }
      } catch (error) {
        if (!active) {
          return
        }

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
  }, [messageApi, serviceId, setLogs, setPorts, upsertService])

  useEffect(() => {
    if (!serviceDetail) {
      return
    }

    setSelectedServiceId(serviceDetail.service.id)
    setActiveLogServiceId(serviceDetail.service.id)
  }, [serviceDetail, setActiveLogServiceId, setSelectedServiceId])

  async function handleAction(action: 'start' | 'stop' | 'restart' | 'kill') {
    if (!serviceDetail) {
      return
    }

    const currentServiceId = serviceDetail.service.id
    setActionLoading(action)
    try {
      if (action === 'start') {
        await startService(currentServiceId)
      }

      if (action === 'stop') {
        await stopService(currentServiceId)
      }

      if (action === 'restart') {
        await restartService(currentServiceId)
      }

      if (action === 'kill') {
        await forceKillService(currentServiceId)
      }

      messageApi.success(`${actionTextMap[action]}成功`)
      await refreshDetail(currentServiceId)
    } catch (error) {
      const errorMessage = getFriendlyServiceActionError(action, error)
      messageApi.error(errorMessage)
      await refreshDetail(currentServiceId)
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
  const statusPresentation = useMemo(
    () => (serviceDetail ? getServiceStatusPresentation(serviceDetail, ports) : null),
    [ports, serviceDetail],
  )
  const actionAvailability = useMemo(
    () => (serviceDetail ? getServiceActionAvailability(serviceDetail, ports) : null),
    [ports, serviceDetail],
  )
  const lifecycleExplanation = useMemo(
    () => (serviceDetail ? getServiceLifecycleExplanation(serviceDetail, ports) : null),
    [ports, serviceDetail],
  )
  const instanceSourceExplanation = useMemo(
    () => (serviceDetail ? getServiceInstanceSourceExplanation(serviceDetail, ports) : null),
    [ports, serviceDetail],
  )

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

  if (!statusPresentation) {
    return null
  }

  if (!actionAvailability || !lifecycleExplanation || !instanceSourceExplanation) {
    return null
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
          <GlassTooltip
            title={
              actionAvailability.startDisabled
                ? actionAvailability.startReason
                : actionLoading === 'start'
                  ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                  : ''
            }
            overlayInnerStyle={
              actionAvailability.startReasonColor
                ? { color: actionAvailability.startReasonColor }
                : undefined
            }
          >
            <span style={{ display: 'inline-block' }}>
              <Button
                disabled={actionLoading === 'start' || actionAvailability.startDisabled}
                onClick={() => void handleAction('start')}
              >
                启动
              </Button>
            </span>
          </GlassTooltip>
          <GlassTooltip
            title={
              actionAvailability.stopDisabled
                ? actionAvailability.stopReason
                : actionLoading === 'stop'
                  ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                  : ''
            }
            overlayInnerStyle={
              actionAvailability.stopReasonColor
                ? { color: actionAvailability.stopReasonColor }
                : undefined
            }
          >
            <span style={{ display: 'inline-block' }}>
              <Button
                disabled={actionLoading === 'stop' || actionAvailability.stopDisabled}
                onClick={() => void handleAction('stop')}
              >
                停止
              </Button>
            </span>
          </GlassTooltip>
          <GlassTooltip
            title={
              actionAvailability.restartDisabled
                ? actionAvailability.restartReason
                : actionLoading === 'restart'
                  ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                  : ''
            }
          >
            <span style={{ display: 'inline-block' }}>
              <Button
                disabled={actionLoading === 'restart' || actionAvailability.restartDisabled}
                onClick={() => void handleAction('restart')}
              >
                重启
              </Button>
            </span>
          </GlassTooltip>
          <GlassTooltip
            title={
              actionAvailability.killDisabled
                ? actionAvailability.killReason
                : actionLoading === 'kill'
                  ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                  : ''
            }
          >
            <span style={{ display: 'inline-block' }}>
              <Button
                danger
                disabled={actionLoading === 'kill' || actionAvailability.killDisabled}
                onClick={() => void handleAction('kill')}
              >
                强制结束
              </Button>
            </span>
          </GlassTooltip>
        </Space>
      </div>
      <Card className="glass-card table-card">
        <Space style={{ marginBottom: 16 }} wrap>
          <Tag>当前状态：{statusPresentation.label}</Tag>
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
            {
              key: 'status',
              label: '当前状态',
              children: <ServiceRuntimeStatusIndicator presentation={statusPresentation} />,
            },
            {
              key: 'statusSource',
              label: '状态来源',
              children: instanceSourceExplanation.detail,
            },
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
              key: 'lifecycle',
              label: '生命周期说明',
              children: lifecycleExplanation.detail,
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
          <Input.TextArea
            readOnly
            value={latestLogs.map((item) => `[${formatDateTime(item.createdAt)}] [${item.streamType}] ${item.content}`).join('\n')}
            className="mono-text glass-panel"
            style={{ height: 280, resize: 'none', backdropFilter: 'none' }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前还没有日志记录" />
        )}
      </Card>
    </Space>
  )
}

export default ServiceDetailPageMain
