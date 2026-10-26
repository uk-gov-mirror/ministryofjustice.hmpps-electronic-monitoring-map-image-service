import type { Page } from 'playwright'
import logger from '../../logger'
import config from '../config'
import presentMapRender, { type MapRenderModel } from '../presenters/mapRender'
import type { MapRenderRequest } from '../schemas/mapRender'
import type PlaywrightBrowserService from './playwrightBrowserService'

export type MapImage = {
  image: Buffer
  contentType: 'image/jpeg' | 'image/png'
}

const DEFAULT_TIMEOUT_MS = 30_000
const MAP_PATH = '/map'

// Number of renders currently in progress, used to correlate memory spikes with concurrent renders.
let activeRenderCount = 0

// Log a pipeline step, tagged with the number of renders in progress.
const logStep = (step: string, extraInfo = ''): void => {
  logger.info(`[mapRendererService] ${step} (activeRenders=${activeRenderCount}${extraInfo})`)
}

// Capture a screenshot of the map element, returning it as a buffer.
const screenshotMapElement = async (page: Page, format: 'jpeg' | 'png', quality?: number): Promise<Buffer> => {
  const mapElement = await page.$('em-map')
  if (!mapElement) {
    throw new Error('Map element <em-map> not found for screenshot')
  }

  return mapElement.screenshot(format === 'jpeg' ? { type: 'jpeg', quality } : { type: 'png' })
}

// Hand the presented data model to the client script and wait for the map to finish rendering.
const renderMapInPage = async (page: Page, model: MapRenderModel): Promise<void> => {
  await page.evaluate(async renderModel => {
    const { renderMap } = globalThis as unknown as { renderMap?: (m: unknown) => Promise<void> }
    if (!renderMap) throw new Error('renderMap is not available on the map page')
    await renderMap(renderModel)
  }, model)
}

export default class MapRendererService {
  constructor(
    private readonly browserService: PlaywrightBrowserService,
    private readonly baseUrl: string = config.playwright.renderBaseUrl,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async render(request: MapRenderRequest): Promise<MapImage> {
    const model = presentMapRender(request)
    const { width, height, format, quality, pixelRatio } = model.output

    const browser = await this.browserService.getBrowser()

    activeRenderCount += 1
    logStep('render:start', `, layers=${model.layers.length}, format=${format}`)

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: pixelRatio,
    })

    try {
      const page = await context.newPage()
      page.setDefaultTimeout(this.timeoutMs)
      page.setDefaultNavigationTimeout(this.timeoutMs)

      await page.goto(`${this.baseUrl}${MAP_PATH}`, { waitUntil: 'domcontentloaded' })
      await renderMapInPage(page, model)
      logStep('render:pageReady')

      const image = await screenshotMapElement(page, format, quality)
      logStep('render:captured', `, bytes=${image.length}`)

      return { image, contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png' }
    } finally {
      await context.close()
      activeRenderCount -= 1
      logStep('render:end')
    }
  }
}
