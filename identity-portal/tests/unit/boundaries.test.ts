import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/**
 * 依赖边界规则测试:用项目真实 ESLint 配置对虚拟文件做 lint,
 * 断言违反设计文档 §依赖边界 的 import 会报 boundaries 错误。
 */
async function lintVirtualFile(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId?.startsWith('boundaries/'))
}

describe('依赖边界(eslint-plugin-boundaries)', () => {
  it('禁止 components 依赖 server', async () => {
    const violations = await lintVirtualFile(
      'components/ui/bad.ts',
      "import '@/server/services/user-service'\n",
    )
    expect(violations.length).toBeGreaterThan(0)
  })

  it('禁止 features 依赖 server/repositories', async () => {
    const violations = await lintVirtualFile(
      'features/users/bad.ts',
      "import '@/server/repositories/user-repository'\n",
    )
    expect(violations.length).toBeGreaterThan(0)
  })

  it('禁止 components 依赖 lib/keycloak', async () => {
    const violations = await lintVirtualFile(
      'components/ui/bad2.ts',
      "import '@/lib/keycloak/admin-client'\n",
    )
    expect(violations.length).toBeGreaterThan(0)
  })

  it('允许 features 依赖 components 与 lib/http', async () => {
    const violations = await lintVirtualFile(
      'features/users/ok.ts',
      "import '@/components/ui/button'\nimport '@/lib/http/response'\n",
    )
    expect(violations).toHaveLength(0)
  })

  it('允许 server/services 依赖 server/repositories 与 lib/keycloak', async () => {
    const violations = await lintVirtualFile(
      'server/services/ok.ts',
      "import '@/server/repositories/user-repository'\nimport '@/lib/keycloak/admin-client'\n",
    )
    expect(violations).toHaveLength(0)
  })
})
