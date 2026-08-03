import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/renderer/src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
})
