import * as monaco from 'monaco-editor'
import { configureMonacoYaml } from 'monaco-yaml'
import { withCatalogYamlWorker } from '../../features/catalog/yaml-worker-adapter'
import { projectWorkerStage } from './stages.mjs'

type YamlProxy = {
  doValidation(uri: string): Promise<unknown[] | undefined>
}
type Mode = 'legacy' | 'repaired'

const originalCreate = monaco.editor.createWebWorker
const yaml = 'enabled: "true"\ndefinitions:\n  target:\n    type: string\n$ref: "#/definitions/target"\n'
const settings = {
  enableSchemaRequest: false,
  schemas: [{
    uri: 'inmemory://worker-regression/catalog.json', fileMatch: ['*'],
    schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } }, additionalProperties: true },
  }],
}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code)
}

async function until<T>(read: () => Promise<T> | T, accept: (value: T) => boolean): Promise<T> {
  const deadline = performance.now() + 10_000
  while (performance.now() < deadline) {
    const value = await read()
    if (accept(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('worker-regression-timeout')
}

/** Test-only public API access; no Portal route, saved auth state or service requests. */
async function run(mode: Mode) {
  const stage = (value: string) => { window.monacoWorkerRegressionStage = projectWorkerStage(value) }
  stage('configure')
  let captured: monaco.editor.MonacoWebWorker<YamlProxy> | undefined
  let links: monaco.languages.LinkProvider | undefined
  let actions: monaco.languages.CodeActionProvider | undefined
  const configuredMonaco = mode === 'repaired'
    ? withCatalogYamlWorker(monaco, () => new Worker('/yaml.worker.js', { type: 'module' }))
    : monaco
  // Capture real registered providers/worker while still delegating every call.
  const facade = {
    ...configuredMonaco,
    editor: {
      ...configuredMonaco.editor,
      createWebWorker<T extends object>(options: monaco.editor.IInternalWebWorkerOptions) {
        const result = configuredMonaco.editor.createWebWorker<T>(options)
        captured = result as unknown as monaco.editor.MonacoWebWorker<YamlProxy>
        return result
      },
    },
    languages: {
      ...monaco.languages,
      registerLinkProvider(selector: monaco.languages.LanguageSelector, provider: monaco.languages.LinkProvider) {
        links = provider
        return monaco.languages.registerLinkProvider(selector, provider)
      },
      registerCodeActionProvider(selector: monaco.languages.LanguageSelector, provider: monaco.languages.CodeActionProvider, metadata?: monaco.languages.CodeActionProviderMetadata) {
        actions = provider
        return monaco.languages.registerCodeActionProvider(selector, provider, metadata)
      },
    },
  }
  const support = configureMonacoYaml(facade, settings)
  const model = monaco.editor.createModel(yaml, 'yaml', monaco.Uri.parse('inmemory://worker-regression/catalog.yaml'))
  const cancellation = new monaco.CancellationTokenSource()
  try {
    assert(monaco.editor.createWebWorker === originalCreate, 'global-api-mutated')
    assert(links && actions, 'providers-not-registered')
    if (mode === 'legacy') {
      stage('legacy-links')
      let rejected = false
      try { await links.provideLinks(model, cancellation.token) } catch (error) {
        // Classify the fixed installed-source condition; never export error prose.
        rejected = error instanceof Error && error.message === 'Missing requestHandler or method: findLinks'
      }
      assert(rejected, 'legacy-negative-did-not-fail')
      return { legacyRejected: true, realWorkerAcceptance: false }
    }
    stage('schema-marker')
    const markers = await until(
      () => monaco.editor.getModelMarkers({ owner: 'yaml', resource: model.uri }),
      (values) => values.some((marker) => marker.startLineNumber === 1 && marker.startColumn === 10
        && marker.endLineNumber === 1 && marker.endColumn === 16
        && marker.severity === monaco.MarkerSeverity.Warning
        && marker.message === 'Incorrect type. Expected "boolean".'),
    )
    stage('links')
    const providedLinks = await links.provideLinks(model, cancellation.token)
    assert(providedLinks && providedLinks.links.length === 1, 'internal-link-missing')
    const link = providedLinks.links[0]
    assert(link.range.startLineNumber === 5 && String(link.url).includes('catalog.yaml'), 'internal-link-target-wrong')
    stage('code-action')
    const fixes = await actions.provideCodeActions(model, model.getFullModelRange(), {
      markers, trigger: monaco.languages.CodeActionTriggerType.Invoke,
    }, cancellation.token)
    const repair = fixes?.actions.find((action) => action.title === 'Convert to boolean')
    assert(repair?.edit?.edits.length, 'boolean-repair-missing')
    for (const edit of repair.edit.edits) {
      assert('textEdit' in edit && edit.resource.toString() === model.uri.toString(), 'repair-target-wrong')
      model.applyEdits([edit.textEdit])
    }
    stage('repair-validation')
    await until(() => monaco.editor.getModelMarkers({ owner: 'yaml', resource: model.uri }), (values) => values.length === 0)
    assert(captured, 'worker-not-created')
    const proxy = await captured.getProxy()
    const validation = await proxy.doValidation(model.uri.toString())
    assert(Array.isArray(validation) && validation.length === 0, 'repaired-model-not-validated')
    stage('schema-update')
    await support.update({ ...settings, schemas: [{ ...settings.schemas[0], schema: {
      ...settings.schemas[0].schema, properties: { enabled: { type: 'string' } },
    } }] })
    await until(() => monaco.editor.getModelMarkers({ owner: 'yaml', resource: model.uri }),
      (values) => values.some((marker) => marker.startLineNumber === 1
        && marker.severity === monaco.MarkerSeverity.Warning
        && marker.message === 'Incorrect type. Expected "string".'))
    assert(captured, 'updated-worker-not-created')
    const changed = await (await captured.getProxy()).doValidation(model.uri.toString())
    assert(Array.isArray(changed) && changed.length > 0, 'updated-schema-not-applied')
    stage('schema-restore')
    await support.update(settings)
    await until(() => monaco.editor.getModelMarkers({ owner: 'yaml', resource: model.uri }), (values) => values.length === 0)
    // Force the restarted manager through the same actual link provider.
    assert((await links.provideLinks(model, cancellation.token))?.links.length === 1, 'updated-worker-link-missing')
    assert(captured, 'restarted-worker-not-created')
    const current = await captured.getProxy()
    const restored = await current.doValidation(model.uri.toString())
    assert(Array.isArray(restored) && restored.length === 0, 'restored-schema-not-applied')
    const uri = model.uri.toString()
    stage('model-disposal')
    model.dispose()
    await until(() => current.doValidation(uri), (value) => value === undefined)
    fixes?.dispose()
    providedLinks.dispose?.()
    stage('complete')
    return { schemaMarker: true, repairedMarkerCleared: true, internalLink: true, codeAction: true, modelRemoved: true, configurationUpdated: true, realWorkerAcceptance: true }
  } finally {
    model.dispose()
    cancellation.dispose()
    support.dispose()
  }
}

declare global {
  interface Window { runMonacoWorkerRegression: typeof run; monacoWorkerRegressionStage: string }
}
window.runMonacoWorkerRegression = run
