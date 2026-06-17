import { Card, Col, Row, Typography } from 'antd'

export function AppearanceSettingsPageMain() {
  return (
    <>
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            主题外观
          </Typography.Title>
          <Typography.Text type="secondary">
            当前已按玻璃态规范接入统一主题，下面用于展示实际设计落点。
          </Typography.Text>
        </div>
      </div>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card className="glass-card form-card" title="Glass Box">
            <Typography.Paragraph>
              容器类组件使用低透明背景、模糊和多层内外阴影，模拟轻盈的毛玻璃质感。
            </Typography.Paragraph>
          </Card>
        </Col>
        <Col span={8}>
          <Card className="glass-card form-card" title="Glass Border">
            <Typography.Paragraph>
              按钮和轻量控件保留柔和的边框高光，悬停时增加白色半透明叠层。
            </Typography.Paragraph>
          </Card>
        </Col>
        <Col span={8}>
          <Card className="glass-card form-card" title="Motion">
            <Typography.Paragraph>
              动效保持短而快，突出“无感启停”和即时反馈，不让本地服务操作显得拖沓。
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </>
  )
}

export default AppearanceSettingsPageMain
