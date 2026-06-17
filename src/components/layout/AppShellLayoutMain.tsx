import {
  AppstoreOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Layout, Menu, Typography, Space } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import type { ReactNode } from 'react'
import { LogoIcon } from '../common/LogoIcon'

const { Header, Sider, Content } = Layout

function MenuLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="menu-item-stack">
      <div className="menu-icon">{icon}</div>
      <div className="menu-text">{text}</div>
    </div>
  )
}

const menuItems = [
  { key: '/', label: <MenuLabel icon={<AppstoreOutlined />} text="主页" /> },
  { key: '/services', label: <MenuLabel icon={<DatabaseOutlined />} text="服务" /> },
  { key: '/logs', label: <MenuLabel icon={<FileSearchOutlined />} text="日志" /> },
  { key: '/ports', label: <MenuLabel icon={<ToolOutlined />} text="端口" /> },
  { key: '/launch-groups', label: <MenuLabel icon={<ClusterOutlined />} text="编排" /> },
  { key: '/history', label: <MenuLabel icon={<HistoryOutlined />} text="历史" /> },
  { key: '/settings/general', label: <MenuLabel icon={<SettingOutlined />} text="设置" /> },
]

export function AppShellLayoutMain() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Layout className="page-shell" style={{ background: 'transparent' }}>
      <Sider
        width={86}
        className="glass-panel app-sider"
        style={{
          margin: 16,
          borderRadius: 16,
          overflow: 'hidden',
          background: 'transparent',
        }}
      >
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <LogoIcon width={48} height={48} />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
          style={{
            background: 'transparent',
            borderInlineEnd: 'none',
          }}
        />
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        <Header
          className="glass-panel"
          style={{
            margin: '16px 16px 0 0',
            borderRadius: 16,
            paddingInline: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
          }}
        >
          <Space align="center" size={16}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              DevTools Launcher
            </Typography.Title>
          </Space>
        </Header>
        <Content className="page-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
