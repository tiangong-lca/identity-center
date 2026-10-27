import { defineConfig, devices } from '@playwright/test'
import { fixture } from './fixture'
import { qualificationBrowserTimeout } from './ui-plan.mjs'

const c = fixture()
export default defineConfig({
  testDir: __dirname,
  testMatch: 'browser.proof.spec.ts',
  timeout: qualificationBrowserTimeout(c.qualificationCase),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: `${c.directory}/private-browser-output`,
  use: { ...devices['Desktop Chrome'], baseURL: c.portalOrigin, locale: 'zh-CN', trace: 'off', screenshot: 'off', video: 'off' },
  // The owned orchestrator starts and verifies a new process; never reuse another server.
})
