import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { useState } from 'react'

import {
  createLaunchGroup,
  listLaunchGroups,
  runLaunchGroup,
  updateLaunchGroup,
} from '@/services/tauri-api/client'
import { useServiceStore } from '@/store/service-store'
import type { LaunchGroupDefinition } from '@/types/service'

interface LaunchGroupFormValue {
  name: string
  description: string
  serviceIds: string[]
}

export function LaunchGroupPageMain() {
  const launchGroups = useServiceStore((state) => state.launchGroups)
  const setLaunchGroups = useServiceStore((state) => state.setLaunchGroups)
  const services = useServiceStore((state) => state.services)
  const [messageApi, contextHolder] = message.useMessage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<LaunchGroupDefinition | null>(null)
  const [form] = Form.useForm<LaunchGroupFormValue>()

  async function refreshGroups() {
    const result = await listLaunchGroups()
    setLaunchGroups(result)
  }

  function openCreateDrawer() {
    setEditingGroup(null)
    form.setFieldsValue({
      name: '',
      description: '',
      serviceIds: [],
    })
    setDrawerOpen(true)
  }

  function openEditDrawer(record: LaunchGroupDefinition) {
    setEditingGroup(record)
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      serviceIds: record.items.map((item) => item.serviceId),
    })
    setDrawerOpen(true)
  }

  async function handleSubmit() {
    const values = await form.validateFields()
    const payload: LaunchGroupDefinition = {
      id: editingGroup?.id ?? '',
      name: values.name,
      description: values.description,
      items: values.serviceIds.map((serviceId, index) => ({
        id: `${editingGroup?.id ?? 'new'}-${serviceId}-${index}`,
        groupId: editingGroup?.id ?? '',
        serviceId,
        sortOrder: index + 1,
        dependsOnServiceId: index > 0 ? values.serviceIds[index - 1] : null,
      })),
      createdAt: editingGroup?.createdAt ?? '',
      updatedAt: editingGroup?.updatedAt ?? '',
    }

    if (editingGroup) {
      await updateLaunchGroup(payload)
      messageApi.success('启动组已更新')
    } else {
      await createLaunchGroup(payload)
      messageApi.success('启动组已创建')
    }

    setDrawerOpen(false)
    await refreshGroups()
  }

  async function handleRun(groupId: string) {
    try {
      await runLaunchGroup(groupId)
      messageApi.success('启动组已开始执行')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '启动组执行失败')
    }
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            启动编排
          </Typography.Title>
          <Typography.Text type="secondary">
            按顺序编排多个服务，一次点击完成一组服务的静默启动。
          </Typography.Text>
        </div>
        <Space>
          <Button onClick={() => void refreshGroups()}>刷新启动组</Button>
          <Button type="primary" onClick={openCreateDrawer}>
            新增启动组
          </Button>
        </Space>
      </div>
      <Card className="glass-card table-card">
        <Table
          rowKey="id"
          dataSource={launchGroups}
          columns={[
            { title: '启动组名称', dataIndex: 'name' },
            { title: '说明', dataIndex: 'description' },
            {
              title: '成员',
              render: (_, record) => record.items.map((item) => item.serviceId).join(' -> '),
            },
            {
              title: '操作',
              render: (_, record) => (
                <Space>
                  <Button size="small" type="primary" onClick={() => void handleRun(record.id)}>
                    执行
                  </Button>
                  <Button size="small" onClick={() => openEditDrawer(record)}>
                    编辑
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        title={editingGroup ? `编辑启动组：${editingGroup.name}` : '新增启动组'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        extra={
          <Button type="primary" onClick={() => void handleSubmit()}>
            保存
          </Button>
        }
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="name" label="启动组名称" rules={[{ required: true, message: '请填写启动组名称' }]}>
            <Input placeholder="例如：后端基础服务组" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} placeholder="说明这个启动组的使用场景。" />
          </Form.Item>
          <Form.Item
            name="serviceIds"
            label="启动顺序"
            extra="多选顺序就是执行顺序，后一个服务默认依赖前一个服务。"
            rules={[{ required: true, message: '请至少选择一个服务' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择服务"
              options={services.map((item) => ({
                label: item.service.name,
                value: item.service.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  )
}

export default LaunchGroupPageMain
