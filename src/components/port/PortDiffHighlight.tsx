import type { CSSProperties, ReactNode } from 'react'

import type { PortDiff } from '@/types/runtime'

interface Props {
  diff: PortDiff | null | undefined
  isConflict?: boolean
  children: ReactNode
  style?: CSSProperties
}

/**
 * 包装器：给子节点附加 diff 标记（通过 data-diff 属性）。
 * 实际颜色高亮由 Ant Design Table 的 rowClassName + 全局 CSS 接管。
 * 这里只标记属性，便于测试 + 调试。
 */
export function PortDiffHighlight({ diff, children }: Props) {
  return (
    <div data-diff={diff ?? 'none'} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
