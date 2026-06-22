import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PORT_DIFF_FADE_OUT_MS } from '../constants'
import { usePortDiff } from '../usePortDiff'

describe('usePortDiff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('5 秒后清空 diff 字段', () => {
    const onClear = vi.fn()
    const { result } = renderHook(() => usePortDiff(onClear))
    act(() => {
      result.current.scheduleClearDiffs()
    })
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(PORT_DIFF_FADE_OUT_MS - 100)
    })
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onClear).toHaveBeenCalledOnce()
  })

  test('连续调用只重置 timer，不叠加', () => {
    const onClear = vi.fn()
    const { result } = renderHook(() => usePortDiff(onClear))
    act(() => {
      result.current.scheduleClearDiffs()
      vi.advanceTimersByTime(3000)
      result.current.scheduleClearDiffs()
      vi.advanceTimersByTime(3000)
    })
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onClear).toHaveBeenCalledOnce()
  })

  test('卸载时清理 timer', () => {
    const onClear = vi.fn()
    const { result, unmount } = renderHook(() => usePortDiff(onClear))
    act(() => {
      result.current.scheduleClearDiffs()
    })
    unmount()
    act(() => {
      vi.advanceTimersByTime(PORT_DIFF_FADE_OUT_MS + 1000)
    })
    expect(onClear).not.toHaveBeenCalled()
  })
})
