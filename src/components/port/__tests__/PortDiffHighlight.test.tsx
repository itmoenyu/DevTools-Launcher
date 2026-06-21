import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { PortDiffHighlight } from '../PortDiffHighlight'

describe('PortDiffHighlight', () => {
  test('diff=new 渲染绿色色条', () => {
    const { container } = render(
      <PortDiffHighlight diff="new">
        <span>content</span>
      </PortDiffHighlight>,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('data-diff')).toBe('new')
  })

  test('diff=changed 渲染黄色色条', () => {
    const { container } = render(
      <PortDiffHighlight diff="changed">
        <span>content</span>
      </PortDiffHighlight>,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('data-diff')).toBe('changed')
  })

  test('diff=gone 渲染红色色条', () => {
    const { container } = render(
      <PortDiffHighlight diff="gone">
        <span>content</span>
      </PortDiffHighlight>,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('data-diff')).toBe('gone')
  })

  test('diff=null 标记 none', () => {
    const { container } = render(
      <PortDiffHighlight diff={null}>
        <span>content</span>
      </PortDiffHighlight>,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('data-diff')).toBe('none')
  })
})
