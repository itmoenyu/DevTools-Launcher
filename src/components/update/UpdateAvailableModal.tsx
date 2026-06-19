import {
  Button,
  Modal,
  Progress,
  Space,
  Typography,
} from 'antd'
import type { CSSProperties } from 'react'

import type { DesktopUpdaterStage } from '@/hooks/useDesktopUpdaterController'

const glassMask: CSSProperties = {
  backdropFilter: 'blur(12px)',
  background: 'rgba(0, 0, 0, 0.3)',
}

const glassContent: CSSProperties = {
  background: 'color-mix(in srgb, #141414 40%, transparent)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: 16,
  boxShadow: [
    '0 25px 50px rgba(0, 0, 0, 0.5)',
    'inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
    'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  ].join(','),
}

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 12px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid rgba(255, 255, 255, 0.15)',
}

interface UpdateAvailableModalProps {
  open: boolean
  stage: DesktopUpdaterStage
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string
  downloadProgress: number | null
  isInstalling: boolean
  canInstall: boolean
  onInstall: () => void
  onCancel: () => void
}

export function UpdateAvailableModal({
  open,
  stage,
  currentVersion,
  latestVersion,
  releaseNotes,
  downloadProgress,
  isInstalling,
  canInstall,
  onInstall,
  onCancel,
}: UpdateAvailableModalProps) {
  const isDownloading = stage === 'downloading'
  const isIdle = stage === 'available'

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={480}
      centered
      closable={false}
      maskStyle={glassMask}
      styles={{ body: glassContent }}
    >
      <Space direction="vertical" size={0} style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #1677ff, #0958d9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(22, 119, 255, 0.35)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
            发现新版本
          </Typography.Title>
          <Typography.Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
            可以更新到最新版本，体验更多功能与优化
          </Typography.Text>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            padding: '12px 0',
          }}
        >
          <div style={{ ...badgeBase, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            当前 v{currentVersion}
          </div>
          <div style={{ alignItems: 'center', display: 'flex', color: 'rgba(255,255,255,0.3)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
          <div style={{ ...badgeBase, background: 'linear-gradient(135deg, rgba(22,119,255,0.2), rgba(9,88,217,0.15))', color: '#1677ff', borderColor: 'rgba(22,119,255,0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            最新 v{latestVersion ?? '--'}
          </div>
        </div>

        {isDownloading && typeof downloadProgress === 'number' ? (
          <div style={{ padding: '8px 0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>正在下载更新包...</Typography.Text>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600 }}>{downloadProgress}%</Typography.Text>
            </div>
            <Progress
              percent={downloadProgress}
              showInfo={false}
              status="active"
              size="small"
              strokeColor={{
                from: '#1677ff',
                to: '#0958d9',
              }}
            />
          </div>
        ) : null}

        {releaseNotes ? (
          <div
            style={{
              margin: '16px 0 20px',
              padding: 14,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              maxHeight: 180,
              overflow: 'auto',
            }}
          >
            <Typography.Text strong style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
              更新说明
            </Typography.Text>
            <Typography.Paragraph
              style={{
                margin: '8px 0 0',
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              {releaseNotes}
            </Typography.Paragraph>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, padding: '8px 0 4px' }}>
          <Button
            block
            size="large"
            onClick={onCancel}
            disabled={isInstalling}
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.8)',
              height: 44,
              borderRadius: 12,
              fontWeight: 500,
            }}
          >
            {isDownloading ? '后台下载' : '稍后再说'}
          </Button>
          <Button
            block
            type="primary"
            size="large"
            loading={isInstalling}
            disabled={!canInstall && !isDownloading}
            onClick={onInstall}
            style={{
              height: 44,
              borderRadius: 12,
              fontWeight: 600,
              background: !canInstall && !isDownloading
                ? undefined
                : 'linear-gradient(135deg, #1677ff, #0958d9)',
              borderColor: 'transparent',
              boxShadow: !canInstall && !isDownloading
                ? undefined
                : '0 4px 14px rgba(22, 119, 255, 0.35)',
            }}
          >
            {isIdle ? '立即更新' : isInstalling ? '正在安装...' : '下载中...'}
          </Button>
        </div>
      </Space>
    </Modal>
  )
}

export default UpdateAvailableModal
