import { Button, Card, Empty, Input, Select, Space, Spin, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { clearLogsByService, queryLogs } from '@/services/tauri-api/client'
import { useAppStore } from '@/store/app-store'
import { useLogStore } from '@/store/log-store'
import { useServiceStore } from '@/store/service-store'
import { formatDateTime } from '@/utils/formatters'

export function RealtimeLogPageMain() {
  const services = useServiceStore((state) => state.services)
  const activeLogServiceId = useAppStore((state) => state.activeLogServiceId)
  const setActiveLogServiceId = useAppStore((state) => state.setActiveLogServiceId)
  const logsMap = useLogStore((state) => state.logs)
  const setLogs = useLogStore((state) => state.setLogs)
  const clearLogs = useLogStore((state) => state.clearLogs)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedServiceId = activeLogServiceId ?? services[0]?.service.id ?? null
  const filteredLogs = useMemo(() => {
    const logs = logsMap[selectedServiceId ?? ''] ?? []

    return logs.filter((item) =>
      keyword ? item.content.toLowerCase().includes(keyword.toLowerCase()) : true,
    )
  }, [keyword, logsMap, selectedServiceId])

  useEffect(() => {
    let active = true

    async function loadHistoryLogs() {
      if (!selectedServiceId) {
        return
      }

      setLoading(true)
      try {
        const logs = await queryLogs(selectedServiceId)
        if (!active) {
          return
        }

        setLogs(selectedServiceId, logs)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadHistoryLogs()

    return () => {
      active = false
    }
  }, [selectedServiceId, setLogs])

  async function handleClear() {
    if (!selectedServiceId) {
      return
    }

    await clearLogsByService(selectedServiceId)
    clearLogs(selectedServiceId)
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            实时日志
          </Typography.Title>
          <Typography.Text type="secondary">
            查看 stdout、stderr 和系统输出，并支持按服务筛选。
          </Typography.Text>
        </div>
        <Space>
          <Select
            value={selectedServiceId ?? undefined}
            style={{ width: 220 }}
            placeholder="选择服务"
            onChange={(value) => setActiveLogServiceId(value)}
            options={services.map((item) => ({
              label: item.service.name,
              value: item.service.id,
            }))}
          />
          <Input
            value={keyword}
            placeholder="搜索关键字"
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 200 }}
          />
          <Button onClick={() => void handleClear()}>清空日志</Button>
        </Space>
      </div>
      <Card className="glass-card table-card">
        {selectedServiceId ? (
          <div className="log-console">
            {loading ? (
              <div className="page-loading" style={{ minHeight: 200 }}>
                <Spin />
              </div>
            ) : filteredLogs.length ? (
              filteredLogs.map((item) => (
                <p key={item.id} className="log-line mono-text">
                  [{formatDateTime(item.createdAt)}] [{item.streamType}] {item.content}
                </p>
              ))
            ) : (
              <Empty description="当前没有匹配的日志内容" />
            )}
          </div>
        ) : (
          <Empty description="请先选择一个服务" />
        )}
      </Card>
    </Space>
  )
}

export default RealtimeLogPageMain
