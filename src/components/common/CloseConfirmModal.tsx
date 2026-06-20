import { Button, Checkbox, Modal, Radio, Space, Typography } from 'antd'
import { useState } from 'react'

const glassMask: React.CSSProperties = {
  backdropFilter: 'blur(12px)',
  background: 'rgba(0,0,0,0.3)',
}

const glassContent: React.CSSProperties = {
  backdropFilter: 'blur(20px)',
  background: 'color-mix(in srgb, var(--ant-color-bg-container) 20%, transparent)',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.25)',
  boxShadow: [
    '0 32px 64px -12px rgba(0,0,0,0.3)',
    'inset 0 0 5px 2px rgba(255,255,255,0.3)',
    'inset 0 5px 2px rgba(255,255,255,0.2)',
  ].join(','),
  padding: 24,
}

interface CloseConfirmModalProps {
  open: boolean
  defaultAction: 'minimize' | 'quit'
  defaultDontRemind: boolean
  onConfirm: (action: 'minimize' | 'quit', dontRemind: boolean) => void
  onCancel: () => void
}

export function CloseConfirmModal({
  open,
  defaultAction,
  defaultDontRemind,
  onConfirm,
  onCancel,
}: CloseConfirmModalProps) {
  const [action, setAction] = useState<'minimize' | 'quit'>(defaultAction)
  const [dontRemind, setDontRemind] = useState(defaultDontRemind)

  function handleOk() {
    onConfirm(action, dontRemind)
  }

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={420}
      centered
      closable={false}
      maskStyle={glassMask}
      styles={{ body: glassContent }}
    >
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          点击关闭按钮以后：
        </Typography.Title>

        <Radio.Group
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio value="minimize" style={{ padding: '8px 0' }}>
              最小化系统托盘
            </Radio>
            <Radio value="quit" style={{ padding: '8px 0' }}>
              退出应用
            </Radio>
          </Space>
        </Radio.Group>

        <Checkbox checked={dontRemind} onChange={(e) => setDontRemind(e.target.checked)}>
          不再提醒
        </Checkbox>

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleOk}>
            确认
          </Button>
        </Space>
      </Space>
    </Modal>
  )
}

export default CloseConfirmModal
