import { Card, Descriptions, Typography } from 'antd'

import { useServiceStore } from '@/store/service-store'

export function ServiceSettingsPageMain() {
  const services = useServiceStore((state) => state.services)

  return (
    <>
      <div className="page-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            服务配置总览
          </Typography.Title>
          <Typography.Text type="secondary">
            统一查看每个服务的 exe 路径、工作目录、端口和当前配置说明。
          </Typography.Text>
        </div>
      </div>
      <div className="settings-grid">
        {services.map((item) => (
          <Card key={item.service.id} className="glass-card form-card" title={item.service.name}>
            <Descriptions
              column={1}
              items={[
                { key: 'exec', label: '可执行文件', children: item.service.execPath },
                { key: 'dir', label: '工作目录', children: item.service.workDir },
                { key: 'port', label: '端口', children: item.service.port ?? '--' },
                {
                  key: 'args',
                  label: '启动参数',
                  children: item.service.args.join(' ') || '--',
                },
                { key: 'desc', label: '说明', children: item.service.description || '--' },
              ]}
            />
          </Card>
        ))}
      </div>
    </>
  )
}

export default ServiceSettingsPageMain
