import { Tooltip } from 'antd';
import type { TooltipProps } from 'antd';

const GLASS_OVERLAY_STYLE: React.CSSProperties = {
  backdropFilter: 'blur(12px)',
  boxShadow:
    'inset 0 0 5px 2px rgba(255,255,255,0.3), inset 0 5px 2px rgba(255,255,255,0.2), 0 6px 16px 0 rgba(0,0,0,0.08)',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.2)',
};

const GLASS_OVERLAY_INNER_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  background: 'transparent',
  color: '#fff',
  textShadow: '0 1px rgba(0,0,0,0.1)',
};

const DEFAULT_ARROW = { pointAtCenter: true } as const;

/**
 * 玻璃态 Tooltip 包装组件。
 *
 * 项目中多处 Tooltip 都贴了同一组玻璃态内联样式，既重复又容易在未来新增 Tooltip 时遗漏。
 * 这里把公共样式收敛到一个组件，调用侧只需要关注 `title` 和 `children`。
 */
export default function GlassTooltip({
  children,
  overlayStyle,
  overlayInnerStyle,
  arrow = DEFAULT_ARROW,
  ...rest
}: TooltipProps) {
  return (
    <Tooltip
      color="rgba(255, 255, 255, 0.15)"
      overlayClassName="glass-tooltip"
      overlayStyle={{ ...GLASS_OVERLAY_STYLE, ...overlayStyle }}
      overlayInnerStyle={{ ...GLASS_OVERLAY_INNER_STYLE, ...overlayInnerStyle }}
      arrow={arrow}
      {...rest}
    >
      {children}
    </Tooltip>
  );
}
