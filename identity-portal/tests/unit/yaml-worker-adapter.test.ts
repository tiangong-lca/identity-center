import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import { withCatalogYamlWorker } from '../../features/catalog/yaml-worker-adapter'

// Exercise the exact installed transitive manager; do not add a direct dependency.
const requireYaml = createRequire(import.meta.resolve('monaco-yaml'))
const { createWorkerManager } = await import(
  pathToFileURL(requireYaml.resolve('monaco-worker-manager')).href
) as {
  createWorkerManager(monaco: typeof Monaco, options: {
    label: string; moduleId: string; createData?: unknown
  }): {
    getWorker(...resources: Monaco.Uri[]): Promise<unknown>
    updateCreateData(data: unknown): void
    dispose(): void
  }
}

afterEach(() => vi.useRealTimers())

function api() {
  const synchronized: Monaco.Uri[][] = []
  const dispose = vi.fn()
  const proxy = { validation: 'synthetic' }
  const createWebWorker = vi.fn((options: Monaco.editor.IInternalWebWorkerOptions) => ({
    getProxy: async () => { await options.worker; return proxy },
    withSyncedResources: async (resources: Monaco.Uri[]) => {
      await options.worker
      synchronized.push(resources)
      return proxy
    },
    dispose,
  }))
  const original = { editor: { createWebWorker }, languages: { identity: 'same-singleton' } }
  return { monaco: original as unknown as typeof Monaco, original, createWebWorker, dispose, proxy, synchronized }
}

function worker() {
  return { postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker
}

describe('catalog YAML compatibility boundary (not real-worker acceptance)', () => {
  it('observes the actual legacy manager missing the required worker without an adapter', async () => {
    const original = api()
    const manager = createWorkerManager(original.monaco, {
      label: 'yaml', moduleId: 'monaco-yaml/yaml.worker', createData: { validate: true },
    })
    try {
      await manager.getWorker()
      const passed = original.createWebWorker.mock.calls[0][0]
      expect(passed).not.toHaveProperty('worker')
      expect(passed).toEqual({ label: 'yaml', moduleId: 'monaco-yaml/yaml.worker', createData: { validate: true } })
    } finally { manager.dispose() }
  })

  it('initializes and synchronizes through the actual manager, then restarts and disposes', async () => {
    const original = api()
    const first = worker(); const second = worker()
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(Promise.resolve(second))
    const facade = withCatalogYamlWorker(original.monaco, factory)
    const data = { schemas: [{ uri: 'inmemory://synthetic.json', schema: { type: 'object' } }] }
    const manager = createWorkerManager(facade, { label: 'yaml', moduleId: 'monaco-yaml/yaml.worker', createData: data })
    const resource = { toString: () => 'inmemory://synthetic.yaml' } as Monaco.Uri
    try {
      expect(await manager.getWorker(resource)).toBe(original.proxy)
      expect(first.postMessage).toHaveBeenNthCalledWith(1, 'ignore')
      expect(first.postMessage).toHaveBeenNthCalledWith(2, data)
      expect(original.synchronized).toEqual([[resource]])
      expect(original.createWebWorker.mock.calls[0][0]).not.toHaveProperty('moduleId')
      expect(facade.languages).toBe(original.monaco.languages)
      expect(original.monaco.editor.createWebWorker).toBe(original.createWebWorker)
      await manager.getWorker(resource)
      expect(factory).toHaveBeenCalledTimes(1)
      manager.updateCreateData({ schemas: [] })
      expect(original.dispose).toHaveBeenCalledTimes(1)
      await manager.getWorker(resource)
      expect(second.postMessage).toHaveBeenNthCalledWith(2, { schemas: [] })
      expect(factory).toHaveBeenCalledTimes(2)
    } finally { manager.dispose() }
    expect(original.dispose).toHaveBeenCalledTimes(2)
    expect(() => manager.getWorker(resource)).toThrow('disposed')
  })

  it('delegates modern Worker options unchanged without invoking the YAML factory', () => {
    const original = api(); const factory = vi.fn()
    const options = { worker: worker(), keepIdleModels: true }
    withCatalogYamlWorker(original.monaco, factory).editor.createWebWorker(options)
    expect(original.createWebWorker).toHaveBeenCalledWith(options)
    expect(factory).not.toHaveBeenCalled()
  })

  it.each([
    ['json', 'monaco-yaml/yaml.worker'], ['yaml', 'unexpected/module'],
  ])('rejects unexpected legacy route %s/%s', (label, moduleId) => {
    const original = api(); const factory = vi.fn()
    const manager = createWorkerManager(withCatalogYamlWorker(original.monaco, factory), { label, moduleId })
    try { expect(() => manager.getWorker()).toThrow('Unsupported catalog YAML worker route') }
    finally { manager.dispose() }
    expect(factory).not.toHaveBeenCalled()
    expect(original.createWebWorker).not.toHaveBeenCalled()
  })

  it('terminates a worker whose initialization data cannot be sent', async () => {
    const original = api(); const instance = worker()
    vi.mocked(instance.postMessage).mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('synthetic bootstrap failure') })
    const manager = createWorkerManager(withCatalogYamlWorker(original.monaco, () => instance), { label: 'yaml', moduleId: 'monaco-yaml/yaml.worker' })
    try { await expect(manager.getWorker()).rejects.toThrow('synthetic bootstrap failure') }
    finally { manager.dispose() }
    expect(instance.terminate).toHaveBeenCalledOnce()
  })
})
