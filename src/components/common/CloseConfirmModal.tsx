import { Button, Checkbox, Modal, Radio, Space, Typography } from 'antd'
import { useState } from 'react'

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
      width={320}
      centered
      closable={false}
      styles={{ body: { height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1.5 } }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%', textAlign: 'center' }}>
        <Typography.Title level={5} style={{ margin: 0, lineHeight: 1.4 }}>
          点击关闭按钮以后：
        </Typography.Title>

        <div className="close-confirm-options">
          <Radio.Group
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <Space direction="vertical" size={4}>
              <Radio value="minimize" style={{ padding: '4px 0', lineHeight: 1.5 }}>
                最小化系统托盘
              </Radio>
              <Radio value="quit" style={{ padding: '4px 0', lineHeight: 1.5 }}>
                退出应用
              </Radio>
            </Space>
          </Radio.Group>
        </div>

        <div className="close-confirm-options" style={{ lineHeight: 1.5, marginTop: 16 }}>
          <Checkbox
            checked={dontRemind}
            onChange={(e) => setDontRemind(e.target.checked)}
            className="square-checkbox"
          >
            不再提醒
          </Checkbox>
        </div>

        <div className="close-confirm-actions">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleOk}>
            确认
          </Button>
        </div>
      </Space>
    </Modal>
  )
}

export default CloseConfirmModal
