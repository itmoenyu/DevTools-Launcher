import { memo } from 'react'
import { Tag } from 'antd'

interface Props {
  serviceName: string
}

/**
 * 「红底白字 ⚠ 服务名」红色徽章——表示我的服务端口被外部进程占用
 */
export const ConflictServiceBadge = memo(function ConflictServiceBadge({ serviceName }: Props) {
  return (
    <Tag color="error" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      ⚠ {serviceName}
    </Tag>
  )
})
