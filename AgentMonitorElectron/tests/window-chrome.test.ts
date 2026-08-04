import { describe, expect, it } from 'vitest'
import { getWindowChromeOptions } from '../src/main/window-chrome'
import { usesNativeWindowControls } from '../src/shared/window-platform'

describe('window chrome', () => {
  it('macOS 使用原生 hiddenInset 窗口控件', () => {
    expect(getWindowChromeOptions('darwin')).toEqual({
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 21 }
    })
    expect(usesNativeWindowControls('darwin')).toBe(true)
  })

  it.each(['win32', 'linux'] as const)('%s 保留自定义窗口控件', (platform) => {
    expect(getWindowChromeOptions(platform)).toEqual({ frame: false })
    expect(usesNativeWindowControls(platform)).toBe(false)
  })
})
