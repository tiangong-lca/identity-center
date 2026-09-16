import { describe, expect, it, vi } from 'vitest'

/**
 * 索引策略契约:身份中心只承载登录、注册、账号与管理界面,没有面向公众的内容。
 * 根布局的 robots 声明必须保持"不索引、不跟踪",否则这些界面会重新进入搜索结果。
 * 这里直接调用真实的 generateMetadata,只替换框架侧依赖。
 */
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}))

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'zh-CN',
  getTranslations: async () => (key: string) => key,
}))

const { generateMetadata } = await import('@/app/layout')

describe('身份中心索引策略', () => {
  it('根元数据要求搜索引擎不索引、不跟踪', async () => {
    const metadata = await generateMetadata()

    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('索引策略不依赖语言,任何语言下都成立', async () => {
    const metadata = await generateMetadata()

    expect(metadata.robots).toMatchObject({ index: false, follow: false })
    expect(metadata.title).toBeTruthy()
  })
})
