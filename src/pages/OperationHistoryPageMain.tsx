import { Card, Table, Tag, Typography } from 'antd'

import { useServiceStore } from '@/store/service-store'
import { formatDateTime } from '@/utils/formatters'

export function OperationHistoryPageMain() {
  const history = useServiceStore((state) => state.history)

  return (
    <>
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            历史记录
          </Typography.Title>
          <Typography.Text type="secondary">
            记录每一次启动、停止、重启和配置修改的结果，便于回溯问题。
          </Typography.Text>
        </div>
      </div>
      <Card className="glass-card table-card">
        <Table
          rowKey="id"
          dataSource={history}
          columns={[
            { title: '服务名称', dataIndex: 'serviceName' },
            { title: '操作类型', dataIndex: 'operationType' },
            {
              title: '结果',
              render: (_, record) => (
                <Tag color={record.result === 'success' ? 'success' : 'error'}>{record.result}</Tag>
              ),
            },
            { title: '消息', dataIndex: 'message' },
            { title: '时间', render: (_, record) => formatDateTime(record.createdAt) },
          ]}
        />
      </Card>
    </>
  )
}

export default OperationHistoryPageMain
