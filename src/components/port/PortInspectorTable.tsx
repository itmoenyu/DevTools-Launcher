import { Button, Table, Tag, Tooltip, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { memo, useMemo } from 'react'

import { killProcessByPid } from '@/services/tauri-api/client'
import type { PortInspectionItem, TcpState } from '@/types/runtime'
import type { ServiceWithRuntime } from '@/types/service'

import { ConflictServiceBadge } from './ConflictServiceBadge'
import { OpenInBrowserButton } from './OpenInBrowserButton'

interface Props {
  ports: PortInspectionItem[]
  services: ServiceWithRuntime[]
  onKill: () => void
}

const STATE_TAG_COLORS: Record<TcpState, string> = {
  LISTENING: 'blue',
  ESTABLISHED: 'green',
  TIME_WAIT: 'default',
  CLOSE_WAIT: 'orange',
  FIN_WAIT1: 'default',
  FIN_WAIT2: 'default',
  SYN_SENT: 'cyan',
  SYN_RECEIVED: 'cyan',
  CLOSING: 'red',
  LAST_ACK: 'red',
  DELETE_TCB: 'default',
  UNKNOWN: 'default',
}

export const PortInspectorTable = memo(function PortInspectorTable({ ports, services, onKill }: Props) {
  const myPorts = useMemo(
    () => new Set(
      services
        .map((s) => s.service.port)
        .filter((p): p is number => typeof p === 'number'),
    ),
    [services],
  )
  const serviceNameByPort = useMemo(
    () => new Map<number, string>(
      services
        .filter((s) => typeof s.service.port === 'number')
        .map((s) => [s.service.port as number, s.service.name]),
    ),
    [services],
  )

  const columns: ColumnsType<PortInspectionItem> = useMemo(() => [
    {
      title: '端口',
      dataIndex: 'port',
      width: 90,
      sorter: (a, b) => a.port - b.port,
      defaultSortOrder: 'ascend',
      render: (port: number) => (
        <span
          style={{
            background: '#e6f4ff',
            color: '#1890ff',
            padding: '2px 8px',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          {port}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 110,
      render: (state: TcpState) => <Tag color={STATE_TAG_COLORS[state]}>{state}</Tag>,
    },
    { title: '协议', dataIndex: 'protocol', width: 60 },
    { title: '本地地址', dataIndex: 'localAddress', width: 120 },
    {
      title: 'PID',
      dataIndex: 'pid',
      width: 70,
      render: (pid: number | null) => pid ?? '--',
    },
    {
      title: '占用进程',
      dataIndex: 'processName',
      ellipsis: true,
      render: (name: string | null, record) =>
        name ? (
          <Tooltip title={record.processPath ?? ''}>
            <span>{name}</span>
          </Tooltip>
        ) : (
          '--'
        ),
    },
    {
      title: '关联服务',
      dataIndex: 'port',
      width: 130,
      render: (port: number, record) => {
        if (!myPorts.has(port)) return '--'
        if (record.pid === null) {
          return <span style={{ color: '#52c41a' }}>{serviceNameByPort.get(port)}</span>
        }
        return <ConflictServiceBadge serviceName={serviceNameByPort.get(port) ?? '?'} />
      },
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <OpenInBrowserButton port={record.port} address={record.localAddress} />
          {record.pid !== null && (
            <Button
              size="small"
              danger
              onClick={async () => {
                try {
                  await killProcessByPid(record.pid!)
                  message.success(`已结束 PID ${record.pid}`)
                  onKill()
                } catch (err) {
                  message.error(
                    `结束失败：${err instanceof Error ? err.message : String(err)}`,
                  )
                }
              }}
            >
              结束
            </Button>
          )}
        </div>
      ),
    },
  ], [myPorts, serviceNameByPort, onKill])

  return (
    <Table<PortInspectionItem>
      rowKey="port"
      dataSource={ports}
      columns={columns}
      size="small"
      pagination={false}
      virtual
      rowClassName={(record) => {
        const classes: string[] = []
        if (record.diff === 'new') classes.push('port-row-new')
        else if (record.diff === 'changed') classes.push('port-row-changed')
        else if (record.diff === 'gone') classes.push('port-row-gone')
        if (myPorts.has(record.port) && record.pid !== null) {
          classes.push('port-row-conflict')
        }
        return classes.join(' ')
      }}
      scroll={{ y: 620, x: 'max-content' }}
    />
  )
})