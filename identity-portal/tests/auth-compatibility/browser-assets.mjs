import fs from 'node:fs'
import path from 'node:path'

// The diagnostic frame allowlist comes from the exact owned standalone build,
// never from an error string, browser URL, external source or production service.
export function emittedBrowserAssetPaths(app) {
  const root = path.join(app, '.next/static')
  const result = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        result.push(`/_next/static/${path.relative(root, file).split(path.sep).join('/')}`)
      }
    }
  }
  visit(root)
  return result.sort()
}
