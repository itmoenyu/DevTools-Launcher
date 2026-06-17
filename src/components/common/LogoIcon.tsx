import type { ImgHTMLAttributes } from 'react'

import appIcon from '../../assets/app-icon.png'

export function LogoIcon(props: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  return <img src={appIcon} alt="DevTools Launcher" {...props} />
}
