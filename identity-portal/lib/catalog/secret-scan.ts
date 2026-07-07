// lib/catalog/secret-scan.ts —— 对入库配置的明文密钥纵深防御。
// 铁律:finding 只出路径 + 模式名 + 提示,绝不回显命中的密文子串。
import type { CatalogDoc } from './schema'

export type SecretFinding = { path: string; pattern: string; hint: string }

const PATTERNS: Array<{ name: string; hint: string; re: RegExp }> = [
  { name: 'bearer-token', hint: 'Authorization Bearer', re: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/ },
  { name: 'url-credential', hint: 'token/key/secret in URL', re: /[?&](token|key|secret|password|api[_-]?key|access[_-]?token)=[^&\s]+/i },
  { name: 'pem-private-key', hint: 'PEM private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'aws-access-key', hint: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'jwt', hint: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/ },
]

function walk(value: unknown, path: string, visit: (path: string, s: string) => void): void {
  if (typeof value === 'string') visit(path, value)
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, visit))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, visit)
}

export function scanForPlaintextSecrets(doc: CatalogDoc): SecretFinding[] {
  const findings: SecretFinding[] = []
  walk(doc, '', (path, s) => {
    for (const p of PATTERNS) {
      if (p.re.test(s)) findings.push({ path, pattern: p.name, hint: p.hint }) // 注意:不 push s
    }
  })
  return findings
}
