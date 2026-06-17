import { LoadingOutlined } from '@ant-design/icons'
import {
  Alert,
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
  Spin,
} from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import ServiceRuntimeStatusIndicator from '@/components/common/ServiceRuntimeStatusIndicator'
import {
  createCustomService,
  deleteService,
  inspectPorts,
  listServices,
  restartService,
  startService,
  stopService,
  updateService,
} from '@/services/tauri-api/client'
import { useAppStore } from '@/store/app-store'
import { useServiceStore } from '@/store/service-store'
import type { ServicePayload, ServiceWithRuntime } from '@/types/service'
import {
  collectServicePorts,
  getFriendlyServiceActionError,
  getServiceActionAvailability,
  getServiceInstanceSourceExplanation,
  getServiceLifecycleExplanation,
  getServiceStatusPresentation,
  mergePortInspectionItems,
} from '@/utils/serviceStatusPresentation'

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
  const ports = useServiceStore((state) => state.ports)
  const setServices = useServiceStore((state) => state.setServices)
  const setPorts = useServiceStore((state) => state.setPorts)
  const setSelectedServiceId = useAppStore((state) => state.setSelectedServiceId)
  const [messageApi, contextHolder] = message.useMessage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceWithRuntime | null>(null)
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [form] = Form.useForm<ServicePayload>()
  const serviceType = Form.useWatch('serviceType', form) ?? defaultFormValue.serviceType

  const serviceRows = useMemo(() => services, [services])

  async function refreshServiceList(successMessage?: string) {
    setTableLoading(true)

    try {
      const result = await listServices()
      setServices(result)

      const managedPorts = collectServicePorts(result)
      if (managedPorts.length) {
        const latestPorts = await inspectPorts(managedPorts)
        setPorts(mergePortInspectionItems(useServiceStore.getState().ports, latestPorts))
      }

      if (successMessage) {
        messageApi.success(successMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新服务列表失败'
      messageApi.error(errorMessage)
      throw error
    } finally {
      setTableLoading(false)
    }
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
    setSubmitLoading(true)

    try {
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
        setDrawerOpen(false)
        await refreshServiceList('服务配置已更新')
        return
      }

      await createCustomService(payload)
      setDrawerOpen(false)
      await refreshServiceList('自定义服务已创建')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存服务配置失败'
      messageApi.error(errorMessage)
    } finally {
      setSubmitLoading(false)
    }
  }

  async function handleDelete(serviceId: string) {
    try {
      await deleteService(serviceId)
      await refreshServiceList('服务已删除')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除服务失败'
      messageApi.error(errorMessage)
    }
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

      await refreshServiceList(`${actionTextMap[action]}成功`)
    } catch (error) {
      const errorMessage = getFriendlyServiceActionError(action, error)
      messageApi.error(errorMessage)
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
      <div className="glass-card table-card">
        <Table
          loading={tableLoading}
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
            {
              title: '实例来源',
              render: (_, record) => {
                const sourceExplanation = getServiceInstanceSourceExplanation(record, ports)

                return (
                  <Tooltip title={sourceExplanation.detail}>
                    <Tag color={sourceExplanation.tone === 'success' ? 'success' : sourceExplanation.tone === 'warning' ? 'warning' : 'default'}>
                      {sourceExplanation.label}
                    </Tag>
                  </Tooltip>
                )
              },
            },
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
              title: '操作',
              render: (_, record) => {
                const isStartLoading = actionLoadingKey === `${record.service.id}-start`
                const isStopLoading = actionLoadingKey === `${record.service.id}-stop`
                const isRestartLoading = actionLoadingKey === `${record.service.id}-restart`
                const actionAvailability = getServiceActionAvailability(record, ports)
                const startTooltipTitle = actionAvailability.startDisabled
                  ? actionAvailability.startReason
                  : isStartLoading
                    ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                    : ''
                const stopTooltipTitle = actionAvailability.stopDisabled
                  ? actionAvailability.stopReason
                  : isStopLoading
                    ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                    : ''
                const restartTooltipTitle = actionAvailability.restartDisabled
                  ? actionAvailability.restartReason
                  : isRestartLoading
                    ? <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />} />
                    : ''

                return (
                  <Space wrap>
                    <Tooltip 
                      title={startTooltipTitle}
                      color="rgba(255, 255, 255, 0.15)"
                      overlayClassName="glass-tooltip"
                      overlayStyle={{
                        backdropFilter: 'blur(12px)',
                        boxShadow: 'inset 0 0 5px 2px rgba(255,255,255,0.3), inset 0 5px 2px rgba(255,255,255,0.2), 0 6px 16px 0 rgba(0,0,0,0.08)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                      overlayInnerStyle={{
                        padding: '10px 16px',
                        background: 'transparent',
                        color: '#fff',
                        textShadow: '0 1px rgba(0,0,0,0.1)',
                      }}
                      arrow={{ pointAtCenter: true }}
                    >
                      <span style={{ display: 'inline-block' }}>
                        <Button
                          size="small"
                          disabled={isStartLoading || actionAvailability.startDisabled}
                          onClick={() => void handleAction(record.service.id, 'start')}
                        >
                          启动
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip 
                      title={stopTooltipTitle}
                      color="rgba(255, 255, 255, 0.15)"
                      overlayClassName="glass-tooltip"
                      overlayStyle={{
                        backdropFilter: 'blur(12px)',
                        boxShadow: 'inset 0 0 5px 2px rgba(255,255,255,0.3), inset 0 5px 2px rgba(255,255,255,0.2), 0 6px 16px 0 rgba(0,0,0,0.08)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                      overlayInnerStyle={{
                        padding: '10px 16px',
                        background: 'transparent',
                        color: '#fff',
                        textShadow: '0 1px rgba(0,0,0,0.1)',
                      }}
                      arrow={{ pointAtCenter: true }}
                    >
                      <span style={{ display: 'inline-block' }}>
                        <Button
                          size="small"
                          disabled={isStopLoading || actionAvailability.stopDisabled}
                          onClick={() => void handleAction(record.service.id, 'stop')}
                        >
                          停止
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip 
                      title={restartTooltipTitle}
                      color="rgba(255, 255, 255, 0.15)"
                      overlayClassName="glass-tooltip"
                      overlayStyle={{
                        backdropFilter: 'blur(12px)',
                        boxShadow: 'inset 0 0 5px 2px rgba(255,255,255,0.3), inset 0 5px 2px rgba(255,255,255,0.2), 0 6px 16px 0 rgba(0,0,0,0.08)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                      overlayInnerStyle={{
                        padding: '10px 16px',
                        background: 'transparent',
                        color: '#fff',
                        textShadow: '0 1px rgba(0,0,0,0.1)',
                      }}
                      arrow={{ pointAtCenter: true }}
                    >
                      <span style={{ display: 'inline-block' }}>
                        <Button
                          size="small"
                          disabled={isRestartLoading || actionAvailability.restartDisabled}
                          onClick={() => void handleAction(record.service.id, 'restart')}
                        >
                          重启
                        </Button>
                      </span>
                    </Tooltip>
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
                )
              },
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
                <Typography.Text>
                  生命周期说明：{getServiceLifecycleExplanation(record, ports).detail}
                </Typography.Text>
                <Typography.Text>
                  实例来源说明：{getServiceInstanceSourceExplanation(record, ports).detail}
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
          <Button type="primary" loading={submitLoading} onClick={() => void handleSubmit()}>
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
