import 'dotenv/config'
import { validateEnv } from '../lib/config/env-schema'

const result = validateEnv(process.env)

if (!result.ok) {
  console.error(`环境变量缺失或非法: ${result.missing.join(', ')}`)
  console.error('参考 deploy/env/.env.example 配置项目根 .env 文件')
  process.exit(1)
}

console.log('环境变量校验通过')
