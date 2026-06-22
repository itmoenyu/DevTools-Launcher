import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

interface ReleaseNotesProps {
  content: string
  className?: string
}

/**
 * 把 release notes 字符串渲染为 Markdown。
 *
 * 内容来源是 GitHub Releases API 的 body（只读、可信），但仍然叠加
 * rehype-sanitize 双重保险，避免将来如果接入了用户可写入口时引入 XSS。
 *
 * remark-gfm 提供 GFM 表格、删除线、任务列表、自动链接等扩展语法，
 * 适配 release notes 里常见的 `###` 分组、列表、表格等写法。
 */
export function ReleaseNotes({ content, className }: ReleaseNotesProps) {
  const markdown = useMemo(() => content?.trim() ?? '', [content])
  if (!markdown) return null

  const mergedClassName = ['release-notes', className].filter(Boolean).join(' ')

  return (
    <div className={mergedClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export default ReleaseNotes