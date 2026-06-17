import {
  Alert,
  Badge,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  createCustomService,
  deleteService,
  listServices,
  restartService,
  startService,
  stopService,
  updateService,
} from '@/services/tauri-api/client'
import { useAppStore } from '@/store/app-store'
import { useServiceStore } from '@/store/service-store'
import { formatStatus } from '@/utils/formatters'
import type { ServicePayload, ServiceWithRuntime } from '@/types/service'

const defaultFormValue: ServicePayload = {
  name: '',
  serviceType: 'custom',
  execPath: '',
  workDir: '',
  args: [],
  env: {},
  port: null,
  stopStrategy: 'taskkill',
  healthcheckStrategy: 'process_and_port',
  description: '',
}

function isServiceConfigured(record: ServiceWithRuntime) {
  return Boolean(record.service.execPath.trim() && record.service.workDir.trim())
}

function getFriendlyActionError(action: 'start' | 'stop' | 'restart', error: unknown) {
  const rawMessage = error instanceof Error ? error.message : `${action}失败`

  if (rawMessage.includes('缺少 exe 路径或工作目录')) {
    return '当前服务还没配置完整。请先点“编辑”，补齐可执行文件路径和工作目录后再启动。'
  }

  if (rawMessage.includes('可执行文件不存在')) {
    return `${rawMessage}。这通常表示你移动了安装目录，或者路径填成了旧位置。`
  }

  if (rawMessage.includes('端口') && rawMessage.includes('已被占用')) {
    return `${rawMessage}。这通常表示服务已经被手动终端、系统服务或其他工具启动了，请先关闭外部实例后再交给面板托管。`
  }

  if (rawMessage.includes('没有记录到可停止的进程 PID')) {
    return '当前没有可由 Launcher 接管的进程记录。只有通过面板启动的服务，面板才能稳定停止。'
  }

  if (rawMessage.includes('未能结束进程 PID') || rawMessage.includes('尝试强制结束 PID')) {
    return `${rawMessage}。你可以先去任务管理器确认该进程是否仍在运行。`
  }

  return rawMessage
}

function getServiceGuide(serviceType: ServicePayload['serviceType']) {
  if (serviceType === 'redis') {
    return 'Redis 推荐填写 redis-server.exe 的完整路径；工作目录建议填写 exe 所在目录。若你使用 redis.windows.conf，可把 --port 6379 或配置文件参数写进启动参数。'
  }

  if (serviceType === 'mysql') {
    return 'MySQL 推荐填写 mysqld.exe 的完整路径；如果你本机已经装成 Windows 服务，请先停止系统服务，再交给 Launcher 托管。启动参数请带上 --defaults-file=你的 my.ini 路径，这样 mysqld 才能读取正确的 datadir、端口和日志配置。工作目录不要机械地填 bin 目录，优先让它跟随 my.ini 所在目录，避免相对日志文件写入 Program Files 时被系统拒绝。'
  }

  return '自定义服务适合没有图形界面的本地进程。建议先在终端确认命令能独立运行，再把 exe、工作目录和参数填写到面板里。'
}

export function ServiceListPageMain() {
  const navigate = useNavigate()
  const services = useServiceStore((state) => state.services)
  const setServices = useServiceStore((state) => state.setServices)
  const setSelectedServiceId = useAppStore((state) => state.setSelectedServiceId)
  const [messageApi, contextHolder] = message.useMessage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceWithRuntime | null>(null)
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)
  const [form] = Form.useForm<ServicePayload>()
  const serviceType = Form.useWatch('serviceType', form) ?? defaultFormValue.serviceType

  const serviceRows = useMemo(() => services, [services])

  async function refreshServiceList() {
    const result = await listServices()
    setServices(result)
  }

  function openCreateDrawer() {
    setEditingService(null)
    form.setFieldsValue(defaultFormValue)
    setDrawerOpen(true)
  }

  function openEditDrawer(record: ServiceWithRuntime) {
    setEditingService(record)
    form.setFieldsValue({
      name: record.service.name,
      serviceType: record.service.serviceType,
      execPath: record.service.execPath,
      workDir: record.service.workDir,
      args: record.service.args,
      env: record.service.env,
      port: record.service.port,
      stopStrategy: record.service.stopStrategy,
      healthcheckStrategy: record.service.healthcheckStrategy,
      description: record.service.description,
    })
    setDrawerOpen(true)
  }

  async function handleSubmit() {
    const values = await form.validateFields()
    const payload: ServicePayload = {
      ...defaultFormValue,
      ...values,
      args: (values.args ?? []).filter(Boolean),
      env: values.env ?? {},
      stopStrategy: values.stopStrategy ?? defaultFormValue.stopStrategy,
      healthcheckStrategy:
        values.healthcheckStrategy ?? defaultFormValue.healthcheckStrategy,
    }

    if (editingService) {
      await updateService({ ...payload, id: editingService.service.id })
      messageApi.success('服务配置已更新')
    } else {
      await createCustomService(payload)
      messageApi.success('自定义服务已创建')
    }

    setDrawerOpen(false)
    await refreshServiceList()
  }

  async function handleDelete(serviceId: string) {
    await deleteService(serviceId)
    messageApi.success('服务已删除')
    await refreshServiceList()
  }

  async function handleAction(serviceId: string, action: 'start' | 'stop' | 'restart') {
    const actionTextMap = {
      start: '启动',
      stop: '停止',
      restart: '重启',
    } as const

    try {
      setActionLoadingKey(`${serviceId}-${action}`)
      if (action === 'start') {
        await startService(serviceId)
      }

      if (action === 'stop') {
        await stopService(serviceId)
      }

      if (action === 'restart') {
        await restartService(serviceId)
      }

      messageApi.success(`${actionTextMap[action]}成功`)
    } catch (error) {
      messageApi.error(getFriendlyActionError(action, error))
    } finally {
      setActionLoadingKey(null)
    }
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            服务管理
          </Typography.Title>
          <Typography.Text type="secondary">
            管理内置 Redis、MySQL，以及你自己新增的本地进程服务。
          </Typography.Text>
        </div>
        <Space>
          <Button onClick={() => void refreshServiceList()}>刷新列表</Button>
          <Button type="primary" onClick={openCreateDrawer}>
            新增自定义服务
          </Button>
        </Space>
      </div>
      <Alert
        type="info"
        showIcon
        className="glass-card"
        message="Launcher 更适合托管由面板自己启动的服务"
        description="如果 Redis、MySQL 已经被系统服务、命令行窗口或其他工具启动，占用端口后，面板会拒绝再次启动；只有通过面板启动的那一份进程，面板才能稳定停止和重启。"
      />
      <div className="glass-card table-card">
        <Table
          rowKey={(record) => record.service.id}
          dataSource={serviceRows}
          columns={[
            {
              title: '服务名称',
              render: (_, record) => (
                <Space orientation="vertical" size={4}>
                  <a
                    onClick={() => {
                      setSelectedServiceId(record.service.id)
                      navigate(`/services/${record.service.id}`)
                    }}
                    style={{ fontSize: 16, fontWeight: 500 }}
                  >
                    {record.service.name}
                  </a>
                  <Typography.Text type="secondary">
                    {record.service.description || '暂无备注说明'}
                  </Typography.Text>
                </Space>
              ),
            },
            { title: '类型', dataIndex: ['service', 'serviceType'] },
            {
              title: '托管准备',
              render: (_, record) => (
                <Space wrap size={[6, 6]}>
                  <Tag color={isServiceConfigured(record) ? 'success' : 'warning'}>
                    {isServiceConfigured(record) ? '配置完整' : '待补路径'}
                  </Tag>
                  <Tag color={record.service.port ? 'blue' : 'default'}>
                    {record.service.port ? `端口 ${record.service.port}` : '未设端口'}
                  </Tag>
                  <Tag color={record.service.isBuiltin ? 'purple' : 'default'}>
                    {record.service.isBuiltin ? '内置模板' : '自定义'}
                  </Tag>
                </Space>
              ),
            },
            { title: '端口', render: (_, record) => record.service.port ?? '--' },
            { title: 'PID', render: (_, record) => record.runtime.pid ?? '--' },
            {
              title: '状态',
              render: (_, record) => {
                const getStatusProps = () => {
                  switch (record.runtime.status) {
                    case 'running':
                      return { status: 'success' as const }
                    case 'error':
                      return { status: 'error' as const }
                    case 'starting':
                    case 'stopping':
                      return { status: 'processing' as const }
                    case 'stopped':
                    case 'unstarted':
                    default:
                      return { status: 'default' as const }
                  }
                }

                return (
                  <Tooltip
                    title={
                      <Space orientation="vertical" size={2}>
                        <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                          {formatStatus(record.runtime.status)}
                        </Typography.Text>
                      </Space>
                    }
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, cursor: 'pointer' }}>
                      <Badge {...getStatusProps()} />
                    </div>
                  </Tooltip>
                )
              },
            },
            {
              title: '操作',
              render: (_, record) => (
                <Space wrap>
                  <Tooltip title={!isServiceConfigured(record) ? '请先补齐 exe 路径和工作目录' : ''}>
                    <Button
                      size="small"
                      loading={actionLoadingKey === `${record.service.id}-start`}
                      disabled={!isServiceConfigured(record) || record.runtime.status === 'running'}
                      onClick={() => void handleAction(record.service.id, 'start')}
                    >
                      启动
                    </Button>
                  </Tooltip>
                  <Button
                    size="small"
                    loading={actionLoadingKey === `${record.service.id}-stop`}
                    disabled={!record.runtime.pid && record.runtime.status !== 'running'}
                    onClick={() => void handleAction(record.service.id, 'stop')}
                  >
                    停止
                  </Button>
                  <Button
                    size="small"
                    loading={actionLoadingKey === `${record.service.id}-restart`}
                    disabled={!isServiceConfigured(record)}
                    onClick={() => void handleAction(record.service.id, 'restart')}
                  >
                    重启
                  </Button>
                  <Button size="small" onClick={() => openEditDrawer(record)}>
                    编辑
                  </Button>
                  {!record.service.isBuiltin ? (
                    <Popconfirm
                      title="确认删除这个服务吗？"
                      onConfirm={() => void handleDelete(record.service.id)}
                    >
                      <Button size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  ) : null}
                </Space>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ display: 'grid', gap: 8 }}>
                <Typography.Text>
                  可执行文件：{record.service.execPath || '尚未配置'}
                </Typography.Text>
                <Typography.Text>
                  工作目录：{record.service.workDir || '尚未配置'}
                </Typography.Text>
                <Typography.Text>
                  启动参数：{record.service.args.join(' ') || '暂无参数'}
                </Typography.Text>
                <Typography.Text type="secondary">
                  托管说明：{getServiceGuide(record.service.serviceType)}
                </Typography.Text>
              </div>
            ),
            rowExpandable: () => true,
          }}
        />
      </div>
      <Drawer
        title={editingService ? `编辑服务：${editingService.service.name}` : '新增自定义服务'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        extra={
          <Button type="primary" onClick={() => void handleSubmit()}>
            保存
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="托管填写建议"
          description={getServiceGuide(serviceType)}
        />
        <Form layout="vertical" form={form} initialValues={defaultFormValue}>
          <Form.Item
            name="name"
            label="服务名称"
            extra="这里填写你在面板里看到的名字，例如：本地 Redis 开发实例。"
            rules={[{ required: true, message: '请填写服务名称' }]}
          >
            <Input placeholder="请输入服务名称" />
          </Form.Item>
          <Form.Item name="serviceType" label="服务类型">
            <Select
              options={[
                { label: 'Redis', value: 'redis' },
                { label: 'MySQL', value: 'mysql' },
                { label: '自定义', value: 'custom' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="execPath"
            label="可执行文件路径"
            extra="这里填写 exe 的完整路径，例如 redis-server.exe 或 mysqld.exe。"
            rules={[{ required: true, message: '请填写 exe 路径' }]}
          >
            <Input placeholder="例如：D:\\tools\\redis\\redis-server.exe" />
          </Form.Item>
          <Form.Item
            name="workDir"
            label="工作目录"
            extra="某些服务依赖当前工作目录读取配置文件，这里建议填写 exe 所在目录。"
            rules={[{ required: true, message: '请填写工作目录' }]}
          >
            <Input placeholder="例如：D:\\tools\\redis" />
          </Form.Item>
          <Form.List name="args">
            {(fields, { add, remove }) => (
              <Form.Item label="启动参数" extra="一行一个参数，便于后面由 Rust 端直接拼接命令。">
                <Space orientation="vertical" style={{ width: '100%' }}>
                  {fields.map((field) => (
                    <Space key={field.key} style={{ width: '100%' }}>
                      <Form.Item name={field.name} noStyle>
                        <Input placeholder="例如：--port 6379" />
                      </Form.Item>
                      <Button onClick={() => remove(field.name)}>删除</Button>
                    </Space>
                  ))}
                  <Button onClick={() => add()}>新增参数</Button>
                </Space>
              </Form.Item>
            )}
          </Form.List>
          <Form.Item name="port" label="服务端口" extra="用于端口占用检查与基础健康检查。">
            <InputNumber style={{ width: '100%' }} min={1} max={65535} placeholder="例如：6379" />
          </Form.Item>
          <Form.Item
            name="stopStrategy"
            label="停止策略"
            extra="普通停止适合大部分本地服务；强制停止会直接结束进程。"
            rules={[{ required: true, message: '请选择停止策略' }]}
          >
            <Select
              options={[
                { label: '普通停止（taskkill）', value: 'taskkill' },
                { label: '强制停止（taskkill /F）', value: 'taskkill_force' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="healthcheckStrategy"
            label="健康检查方式"
            extra="进程 + 端口更稳妥；只检查进程适合没有固定端口的服务。"
            rules={[{ required: true, message: '请选择健康检查方式' }]}
          >
            <Select
              options={[
                { label: '进程 + 端口', value: 'process_and_port' },
                { label: '仅进程', value: 'process_only' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="备注说明">
            <Input.TextArea rows={4} placeholder="记录这个服务的用途、依赖说明或启动注意事项。" />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  )
}

export default ServiceListPageMain
