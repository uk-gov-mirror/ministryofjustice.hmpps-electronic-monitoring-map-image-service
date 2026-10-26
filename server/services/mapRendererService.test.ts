import MapRendererService from './mapRendererService'
import type PlaywrightBrowserService from './playwrightBrowserService'
import mapRenderSchema from '../schemas/mapRender'

jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}))

describe('MapRendererService', () => {
  const request = mapRenderSchema.parse({
    output: { width: 1200, height: 650, pixelRatio: 1.2, format: 'jpeg', quality: 80 },
    layers: [{ type: 'locations', id: 'l', points: [{ latitude: 51.5, longitude: -0.1 }] }],
  })

  const createMocks = () => {
    const mapElement = { screenshot: jest.fn().mockResolvedValue(Buffer.from('image')) }
    const page = {
      evaluate: jest.fn().mockResolvedValue(undefined),
      goto: jest.fn().mockResolvedValue(undefined),
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      $: jest.fn().mockResolvedValue(mapElement),
    }
    const context = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined) }
    const browser = { newContext: jest.fn().mockResolvedValue(context) }
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService

    return { mapElement, page, context, browser, service: new MapRendererService(browserService, 'http://map.test') }
  }

  it('renders the model in the map page and returns the screenshot', async () => {
    const { mapElement, page, context, browser, service } = createMocks()

    const result = await service.render(request)

    expect(browser.newContext).toHaveBeenCalledWith({ viewport: { width: 1200, height: 650 }, deviceScaleFactor: 1.2 })
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(30_000)
    expect(page.goto).toHaveBeenCalledWith('http://map.test/map', { waitUntil: 'domcontentloaded' })
    expect(page.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ layers: [expect.objectContaining({ type: 'locations' })] }),
    )
    expect(mapElement.screenshot).toHaveBeenCalledWith({ type: 'jpeg', quality: 80 })
    expect(context.close).toHaveBeenCalled()
    expect(result).toEqual({ image: Buffer.from('image'), contentType: 'image/jpeg' })
  })

  it('captures png without a quality', async () => {
    const { mapElement, service } = createMocks()

    const result = await service.render({ ...request, output: { format: 'png' } })

    expect(mapElement.screenshot).toHaveBeenCalledWith({ type: 'png' })
    expect(result.contentType).toBe('image/png')
  })

  it('rejects with the page script error and still closes the context', async () => {
    const { page, mapElement, context, service } = createMocks()
    page.evaluate.mockRejectedValue(new Error('Could not fit the map to the supplied layers'))

    await expect(service.render(request)).rejects.toThrow('Could not fit the map to the supplied layers')
    expect(mapElement.screenshot).not.toHaveBeenCalled()
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it('times out when the page never finishes rendering and still closes the context', async () => {
    const { page, mapElement, context, browser } = createMocks()
    page.evaluate.mockReturnValue(new Promise(() => {}))
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService
    const service = new MapRendererService(browserService, 'http://map.test', 20)

    await expect(service.render(request)).rejects.toThrow('Map render did not complete within 20ms')
    expect(mapElement.screenshot).not.toHaveBeenCalled()
    expect(context.close).toHaveBeenCalledTimes(1)
  })
})
