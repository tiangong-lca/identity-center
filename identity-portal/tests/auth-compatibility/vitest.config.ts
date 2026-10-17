import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '../..') } },
  test: { include: ['tests/auth-compatibility/*.integration.test.ts'], testTimeout: 60_000, hookTimeout: 30_000, fileParallelism: false },
})
