import type * as Monaco from 'monaco-editor'

type LegacyYamlWorkerOptions = {
  label: string
  moduleId: string
  createData?: unknown
  host?: Record<string, (...args: unknown[]) => unknown>
  keepIdleModels?: boolean
}

/**
 * Adapt only monaco-yaml's legacy manager boundary to Monaco 0.55.1's Worker API.
 * Initialization order follows monaco-editor v0.55.1 src/common/workers.ts.
 * The original singleton is never modified; other consumers keep its actual API.
 */
export function withCatalogYamlWorker(
  monaco: typeof Monaco,
  createYamlWorker: () => Worker | Promise<Worker>,
): typeof Monaco {
  return {
    ...monaco,
    editor: {
      ...monaco.editor,
      createWebWorker<T extends object>(
        options: Monaco.editor.IInternalWebWorkerOptions | LegacyYamlWorkerOptions,
      ): Monaco.editor.MonacoWebWorker<T> {
        if ('worker' in options) return monaco.editor.createWebWorker<T>(options)
        if (options.label !== 'yaml' || options.moduleId !== 'monaco-yaml/yaml.worker') {
          throw new Error('Unsupported catalog YAML worker route')
        }
        const worker = Promise.resolve(createYamlWorker()).then((instance) => {
          try {
            instance.postMessage('ignore')
            instance.postMessage(options.createData)
          } catch (error) {
            instance.terminate()
            throw error
          }
          return instance
        })
        return monaco.editor.createWebWorker<T>({
          worker,
          host: options.host,
          keepIdleModels: options.keepIdleModels,
        })
      },
    },
  }
}
