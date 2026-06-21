import { Button, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useState } from 'react'

import { useServiceStore } from '@/store/service-store'
import { PORT_FILTER_LABELS, type PortFilterMode } from '@/modules/port-manager/constants'

const FILTERS: PortFilterMode[] = ['all', 'mine', 'listening', 'conflict']

interface Props {
  mode: PortFilterMode
  onChange: (mode: PortFilterMode) => void
  onSearch: (keyword: string) => void
}

/**
 * 快捷过滤标签 + 搜索框。
 * 回车触发搜索，输入仅维护本地 value，不实时过滤。
 */
export function PortInspectorQuickFilters({ mode, onChange, onSearch }: Props) {
  const [inputValue, setInputValue] = useState('')

  function handleSearch() {
    onSearch(inputValue.trim())
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        background: '#fafafa',
      }}
    >
      {FILTERS.map((f) => (
        <FilterChip key={f} mode={f} active={mode === f} onClick={() => onChange(f)} />
      ))}
      <div style={{ flex: 1 }} />
      <Input
        placeholder="搜索端口/进程"
        prefix={<SearchOutlined />}
        style={{ width: 240 }}
        allowClear
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onPressEnter={handleSearch}
        suffix={
          <SearchOutlined
            style={{ cursor: 'pointer', color: '#1677ff' }}
            onClick={handleSearch}
          />
        }
      />
    </div>
  )
}

function FilterChip({
  mode,
  active,
  onClick,
}: {
  mode: PortFilterMode
  active: boolean
  onClick: () => void
}) {
  const count = useServiceStore((s) => {
    if (mode === 'all') return s.summary.total
    if (mode === 'listening') return s.summary.listening
    if (mode === 'conflict') return s.summary.conflict
    if (mode === 'mine') {
      const myPorts = new Set(
        s.services
          .map((sv) => sv.service.port)
          .filter((p): p is number => typeof p === 'number'),
      )
      return s.ports.filter((p) => myPorts.has(p.port) && p.diff !== 'gone').length
    }
    return 0
  })
  return (
    <Button
      type={active ? 'primary' : 'default'}
      onClick={onClick}
      size="small"
      style={
        mode === 'mine'
          ? { display: 'inline-flex', alignItems: 'center', gap: 4 }
          : undefined
      }
    >
      {mode === 'mine' && (
        <span style={{ color: active ? '#fff' : '#1890ff', marginRight: 2 }}>★</span>
      )}
      {PORT_FILTER_LABELS[mode]}
      {count > 0 && (
        <span
          style={{
            marginLeft: 4,
            background:
              active
                ? 'rgba(255,255,255,0.2)'
                : mode === 'conflict' && count > 0
                  ? '#fff1f0'
                  : '#f0f0f0',
            color:
              active
                ? '#fff'
                : mode === 'conflict' && count > 0
                  ? '#ff4d4f'
                  : '#595959',
            padding: '0 6px',
            borderRadius: 8,
            fontSize: 11,
          }}
        >
          {count}
        </span>
      )}
    </Button>
  )
}