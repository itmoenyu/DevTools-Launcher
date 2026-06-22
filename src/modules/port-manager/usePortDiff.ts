import { useCallback, useEffect, useRef } from 'react'

import { PORT_DIFF_FADE_OUT_MS } from './constants'

/**
 * 管理 port diff 标记的 5 秒淡出 timer。
 *
 * - `scheduleClearDiffs`：调度一次「5 秒后清空 diff 标记」
 * - 连续调用会重置 timer（debounce 语义），避免叠加
 * - 组件卸载时清理 timer，避免内存泄漏 / setState-on-unmounted
 */
export function usePortDiff(onClear: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onClearRef = useRef(onClear)

  // render 阶段不能写 ref.current，移到 effect 中
  useEffect(() => {
    onClearRef.current = onClear
  }, [onClear])

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const scheduleClearDiffs = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onClearRef.current()
      timerRef.current = null
    }, PORT_DIFF_FADE_OUT_MS)
  }, [])

  return { scheduleClearDiffs }
}
