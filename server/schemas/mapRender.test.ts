import mapRenderSchema from './mapRender'

const validRequest = () => ({
  output: { width: 800, height: 600, format: 'jpeg' as const },
  layers: [
    {
      type: 'tracks' as const,
      id: 'track',
      points: [
        { latitude: 51.5, longitude: -0.1 },
        { latitude: 51.6, longitude: -0.2 },
      ],
      style: { stroke: { color: '#1d70b8', lineDash: [8, 4] } },
    },
  ],
})

describe('mapRenderSchema', () => {
  it('accepts a valid request', () => {
    expect(mapRenderSchema.safeParse(validRequest()).success).toBe(true)
  })

  it('accepts an outline-only circles layer and a circle marker on locations', () => {
    const points = [{ latitude: 51.5, longitude: -0.1 }]
    const request = {
      layers: [
        {
          type: 'circles',
          id: 'c',
          points: points.map(point => ({ ...point, precision: 5 })),
          style: { fill: null, stroke: { color: '#f2c94c', width: 2, lineDash: [8, 8] } },
        },
        {
          type: 'locations',
          id: 'l',
          points,
          marker: { type: 'circle', radius: 5, fill: '#1d70b8', stroke: { color: '#ffffff', width: 1 } },
        },
      ],
    }

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it('accepts style as an alias for marker on locations but rejects unknown marker types', () => {
    const points = [{ latitude: 51.5, longitude: -0.1 }]

    expect(
      mapRenderSchema.safeParse({ layers: [{ type: 'locations', id: 'l', points, style: { radius: 5 } }] }).success,
    ).toBe(true)
    expect(
      mapRenderSchema.safeParse({ layers: [{ type: 'locations', id: 'l', points, marker: { type: 'pin' } }] }).success,
    ).toBe(false)
  })

  it('accepts track entry and exit options with bearings', () => {
    const request = {
      layers: [
        {
          type: 'tracks',
          id: 't',
          points: [
            { latitude: 51.5, longitude: -0.1, entryBearing: 60 },
            { latitude: 51.6, longitude: -0.2, exitBearing: 75 },
          ],
          entryExit: {
            extensionMetres: 50,
            extendBeyond: { centre: { latitude: 51.5, longitude: -0.1 }, radiusMetres: 100 },
          },
        },
      ],
    }

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it('rejects entryExit on lines and out of range bearings', () => {
    const points = [
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.6, longitude: -0.2 },
    ]
    const entryExit = { extensionMetres: 50 }

    expect(mapRenderSchema.safeParse({ layers: [{ type: 'lines', id: 'l', points, entryExit }] }).success).toBe(false)
    expect(
      mapRenderSchema.safeParse({
        layers: [{ type: 'tracks', id: 't', points: [{ ...points[0], entryBearing: 361 }, points[1]] }],
      }).success,
    ).toBe(false)
  })

  it('accepts fitToLayerIds that match supplied layers and rejects unknown ids', () => {
    const layers = [{ type: 'locations', id: 'a', points: [{ latitude: 51.5, longitude: -0.1 }] }]

    expect(mapRenderSchema.safeParse({ viewport: { mode: 'fit', fitToLayerIds: ['a'] }, layers }).success).toBe(true)
    expect(mapRenderSchema.safeParse({ viewport: { mode: 'fit', fitToLayerIds: ['x'] }, layers }).success).toBe(false)
    expect(mapRenderSchema.safeParse({ viewport: { mode: 'fit', fitToLayerIds: [] }, layers }).success).toBe(false)
  })

  it('accepts a request with only layers', () => {
    const { output, ...layersOnly } = validRequest()

    expect(output).toBeDefined()
    expect(mapRenderSchema.safeParse(layersOnly).success).toBe(true)
  })

  it('accepts quality when the format is omitted as it defaults to jpeg', () => {
    const request = { ...validRequest(), output: { quality: 80 } }

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it.each([
    ['omitted', undefined],
    ['an empty fit', { mode: 'fit' }],
    ['a fit with options', { mode: 'fit', padding: 40, maxZoom: 15 }],
  ])('accepts a fit viewport when it is %s', (_name, viewport) => {
    expect(mapRenderSchema.safeParse({ ...validRequest(), viewport }).success).toBe(true)
  })

  it.each([
    ['an empty object', {}],
    ['only padding', { padding: 40 }],
  ])('rejects a viewport without a mode when it is %s', (_name, viewport) => {
    expect(mapRenderSchema.safeParse({ ...validRequest(), viewport }).success).toBe(false)
  })

  it('accepts an explicit viewport with no layers', () => {
    const request = {
      layers: [],
      viewport: { mode: 'explicit', centre: { latitude: 51.5, longitude: -0.1 }, zoom: 12 },
    }

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it('accepts an explicit viewport with no layers key', () => {
    const request = { viewport: { mode: 'explicit', centre: { latitude: 51.5, longitude: -0.1 }, zoom: 12 } }

    expect(mapRenderSchema.parse(request).layers).toEqual([])
  })

  it('rejects an empty request as there is nothing to draw or show', () => {
    const result = mapRenderSchema.safeParse({})

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('At least one layer is required unless the viewport is explicit')
  })

  it('rejects no layers unless the viewport is explicit', () => {
    expect(mapRenderSchema.safeParse({ layers: [] }).success).toBe(false)
    expect(mapRenderSchema.safeParse({ layers: [], viewport: { mode: 'fit' } }).success).toBe(false)
  })

  it('rejects an explicit viewport without a centre or zoom', () => {
    expect(mapRenderSchema.safeParse({ ...validRequest(), viewport: { mode: 'explicit', zoom: 12 } }).success).toBe(
      false,
    )
  })

  it('rejects mixing explicit and fit options', () => {
    const viewport = { mode: 'explicit', centre: { latitude: 51.5, longitude: -0.1 }, zoom: 12, padding: 10 }

    expect(mapRenderSchema.safeParse({ ...validRequest(), viewport }).success).toBe(false)
  })

  it('rejects unknown fields so unsupported options fail loudly', () => {
    const request = validRequest()
    ;(request.layers[0] as Record<string, unknown>).iconSrc = 'http://internal/icon.png'

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('rejects empty points', () => {
    const request = validRequest()
    request.layers[0].points = []

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('rejects duplicate layer ids', () => {
    const request = validRequest()
    request.layers.push({ ...request.layers[0] })

    const result = mapRenderSchema.safeParse(request)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Layer ids must be unique')
  })

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -5],
  ])('rejects circles with %s precision', (_name, precision) => {
    const request = {
      ...validRequest(),
      layers: [{ type: 'circles', id: 'c', points: [{ latitude: 51.5, longitude: -0.1, precision }] }],
    }

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('requires a label for text points', () => {
    const request = {
      ...validRequest(),
      layers: [{ type: 'text', id: 't', points: [{ latitude: 51.5, longitude: -0.1 }] }],
    }

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it.each([
    ['latitude', { latitude: 91, longitude: 0 }],
    ['longitude', { latitude: 0, longitude: 181 }],
    ['NaN', { latitude: Number.NaN, longitude: 0 }],
  ])('rejects out of range %s', (_name, point) => {
    const request = validRequest()
    request.layers[0].points = [point]

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('rejects colours that are not hex', () => {
    const request = validRequest()

    request.layers[0].style.stroke.color = 'rgb(255, 0, 0)'
    expect(mapRenderSchema.safeParse(request).success).toBe(false)

    request.layers[0].style.stroke.color = 'url(javascript:alert(1))'
    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it.each(['#fff', '#1d70b8', '#1d70b833'])('accepts the hex colour %s', colour => {
    const request = validRequest()
    request.layers[0].style.stroke.color = colour

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it('rejects quality for png output', () => {
    const request = { ...validRequest(), output: { width: 800, height: 600, format: 'png', quality: 80 } }

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('rejects oversized output', () => {
    const request = { ...validRequest(), output: { width: 100_000, height: 600, format: 'png' } }

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('rejects an image that is too large once pixelRatio is applied', () => {
    const request = { ...validRequest(), output: { width: 2000, height: 2000, pixelRatio: 2 } }

    const result = mapRenderSchema.safeParse(request)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['output'])
  })

  it('accepts a typical report image at 2x', () => {
    const request = { ...validRequest(), output: { width: 1200, height: 650, pixelRatio: 2 } }

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it('rejects padding that leaves no room in the image', () => {
    const request = { ...validRequest(), output: { width: 200, height: 200 }, viewport: { mode: 'fit', padding: 100 } }

    expect(mapRenderSchema.safeParse(request).success).toBe(false)
  })

  it('checks default padding against a small image', () => {
    const request = { ...validRequest(), output: { width: 100, height: 100 } }

    expect(mapRenderSchema.safeParse(request).success).toBe(true)
  })

  it('rejects too many points in total across layers', () => {
    const points = Array.from({ length: 4000 }, (_, i) => ({ latitude: 51 + i / 100_000, longitude: -0.1 }))
    const layer = (id: string) => ({ type: 'locations', id, points })
    const request = { ...validRequest(), layers: [layer('a'), layer('b'), layer('c')] }

    const result = mapRenderSchema.safeParse(request)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['layers'])
  })

  describe('attribution', () => {
    it.each([
      ['omitted', undefined],
      ['text', 'Contains OS data'],
    ])('accepts attribution when it is %s', (_name, attribution) => {
      expect(mapRenderSchema.safeParse({ ...validRequest(), output: { attribution } }).success).toBe(true)
    })

    it.each([
      ['empty', '  '],
      ['too long', 'a'.repeat(201)],
      ['an object', { text: 'Contains OS data' }],
      ['false', false],
    ])('rejects attribution when it is %s', (_name, attribution) => {
      expect(mapRenderSchema.safeParse({ ...validRequest(), output: { attribution } }).success).toBe(false)
    })
  })

  describe('lines and tracks', () => {
    const twoPoints = [
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.6, longitude: -0.2 },
    ]

    it('accepts a line with a colour', () => {
      const layers = [{ type: 'lines', id: 'l', points: twoPoints, style: { stroke: { color: '#11dd77' } } }]

      expect(mapRenderSchema.safeParse({ layers }).success).toBe(true)
    })

    it.each(['lines', 'tracks'])('rejects a %s layer with a single point', type => {
      const layers = [{ type, id: 'l', points: [twoPoints[0]] }]

      expect(mapRenderSchema.safeParse({ layers }).success).toBe(false)
    })

    it('rejects lineDash on a line, as the component only supports it on tracks', () => {
      const layers = [{ type: 'lines', id: 'l', points: twoPoints, style: { stroke: { lineDash: [4, 2] } } }]

      expect(mapRenderSchema.safeParse({ layers }).success).toBe(false)
    })
  })
})
