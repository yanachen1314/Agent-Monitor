const hasValue = (name) => typeof process.env[name] === 'string' && process.env[name].trim() !== ''
const hasAll = (...names) => names.every(hasValue)

const hasSigningCredentials = hasValue('CSC_LINK') || hasValue('CSC_NAME')
const hasNotarizationCredentials =
  hasAll('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER') ||
  hasAll('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID') ||
  hasAll('APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE')

if (!hasSigningCredentials || !hasNotarizationCredentials) {
  const missing = []
  if (!hasSigningCredentials) missing.push('签名身份（CSC_LINK 或 CSC_NAME）')
  if (!hasNotarizationCredentials) missing.push('一组完整的 Apple 公证凭据')
  process.stderr.write(`缺少 macOS 正式发布凭据：${missing.join('、')}。\n`)
  process.exitCode = 1
}
