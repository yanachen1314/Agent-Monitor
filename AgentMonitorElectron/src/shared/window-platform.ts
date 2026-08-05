export function usesNativeWindowControls(platform: string): boolean {
  return platform === 'darwin'
}
