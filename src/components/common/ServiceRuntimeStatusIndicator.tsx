import { Badge, Space, Tooltip, Typography } from 'antd'

import type { ServiceStatusPresentation } from '@/utils/serviceStatusPresentation'

interface ServiceRuntimeStatusIndicatorProps {
  presentation: ServiceStatusPresentation
  showDetail?: boolean
}

export function ServiceRuntimeStatusIndicator({
  presentation,
}: ServiceRuntimeStatusIndicatorProps) {
  const content = (
    <Space size={8}>
      <Badge status={presentation.tone} />
      <Typography.Text>{presentation.label}</Typography.Text>
    </Space>
  )

  return (
    <Tooltip
      title={
        <Space direction="vertical" size={2}>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            {presentation.label}
          </Typography.Text>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
            {presentation.detail}
          </Typography.Text>
        </Space>
      }
    >
      <span>{content}</span>
    </Tooltip>
  )
}

export default ServiceRuntimeStatusIndicator
