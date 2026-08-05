import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const credentialNames = [
  'CSC_LINK',
  'CSC_NAME',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_KEYCHAIN',
  'APPLE_KEYCHAIN_PROFILE'
] as const

function environmentWithoutReleaseCredentials(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  for (const name of credentialNames) delete environment[name]
  return environment
}

describe('macOS release credential validation', () => {
  it('在编译前拒绝缺少签名和公证凭据的正式发布', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-mac-release.cjs'], {
      cwd: projectRoot,
      env: environmentWithoutReleaseCredentials(),
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('缺少 macOS 正式发布凭据')
  })

  it('接受完整的签名和 Apple ID 公证凭据组合', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-mac-release.cjs'], {
      cwd: projectRoot,
      env: {
        ...environmentWithoutReleaseCredentials(),
        CSC_LINK: 'certificate.p12',
        APPLE_ID: 'developer@example.com',
        APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
        APPLE_TEAM_ID: 'TEAM123'
      },
      encoding: 'utf8'
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })
})
