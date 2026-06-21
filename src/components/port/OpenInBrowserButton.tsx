import { Button, message } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'

import { openInBrowser } from '@/services/tauri-api/client'

interface Props {
  port: number
  address: string
}

/**
 * 「🌍 在浏览器中打开」按钮
 * - 0.0.0.0 / 127.0.0.1 / [::] / 空 都视为回环
 * - 后端拼接为 http://localhost:<port> 打开
 */
export function OpenInBrowserButton({ port, address }: Props) {
  return (
    <Button
      type="link"
      size="small"
      icon={<GlobalOutlined />}
      onClick={async () => {
        try {
          await openInBrowser(port, address)
        } catch (err) {
          message.error(`打开失败：${err instanceof Error ? err.message : String(err)}`)
        }
      }}
    >
      打开
    </Button>
  )
}
