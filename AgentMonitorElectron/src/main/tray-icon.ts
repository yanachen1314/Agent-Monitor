import { join } from 'node:path'
import { nativeImage, type NativeImage } from 'electron'

const trayAssetPath = (): string =>
  join(
    __dirname,
    '../../resources/tray',
    process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon.png'
  )

export function createTrayIcon(): NativeImage {
  const source = nativeImage.createFromPath(trayAssetPath())
  if (source.isEmpty() || source.getSize().width === 0) {
    throw new Error('TRAY_ICON_INVALID')
  }

  const image = source.resize({ width: 16, height: 16, quality: 'best' })
  if (process.platform === 'win32') {
    image.addRepresentation({
      scaleFactor: 1.25,
      buffer: source.resize({ width: 20, height: 20, quality: 'best' }).toPNG()
    })
    image.addRepresentation({
      scaleFactor: 1.5,
      buffer: source.resize({ width: 24, height: 24, quality: 'best' }).toPNG()
    })
  }
  image.addRepresentation({
    scaleFactor: 2,
    buffer: source.toPNG()
  })
  if (process.platform === 'darwin') image.setTemplateImage(true)

  if (image.isEmpty() || image.getSize().width === 0) {
    throw new Error('TRAY_ICON_INVALID')
  }
  return image
}
