import { usesNativeWindowControls } from '../shared/window-platform'

type WindowChromeOptions = Pick<
  Electron.BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'trafficLightPosition'
>

export function getWindowChromeOptions(platform: NodeJS.Platform): WindowChromeOptions {
  if (usesNativeWindowControls(platform)) {
    return {
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 21 }
    }
  }
  return { frame: false }
}
