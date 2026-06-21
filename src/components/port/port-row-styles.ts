import { createGlobalStyle } from 'antd-style'

/**
 * 端口表格行级高亮（TCPView 风格颜色 diff + 冲突告警）。
 *
 * 通过 createGlobalStyle 注入到全局，Ant Design Table 的 rowClassName
 * 加上对应 class 即可触发。
 */
export const PortRowStyles = createGlobalStyle`
  .port-row-new td {
    background-color: #f6ffed !important;
    box-shadow: inset 3px 0 0 #52c41a;
  }
  .port-row-changed td {
    background-color: #fffbe6 !important;
    box-shadow: inset 3px 0 0 #faad14;
  }
  .port-row-gone td {
    background-color: #fff1f0 !important;
    box-shadow: inset 3px 0 0 #ff4d4f;
  }
  .port-row-gone td * {
    text-decoration: line-through;
    color: #8c8c8c;
  }
  .port-row-conflict td {
    background-color: rgba(255, 77, 79, 0.06) !important;
    box-shadow: inset 3px 0 0 #ff4d4f;
  }
`
