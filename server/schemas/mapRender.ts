import { z } from 'zod/v4'

export const MAX_LAYERS = 20
export const MAX_POINTS_PER_LAYER = 5000
export const MAX_TOTAL_POINTS = 10_000
export const MIN_OUTPUT_PX = 100
export const MAX_OUTPUT_PX = 2000
export const MAX_PIXEL_RATIO = 2
export const MAX_ATTRIBUTION_LENGTH = 200
// Caps Chromium's memory use, counting pixelRatio (e.g. 1200x650 at 2x is about 3.1M).
export const MAX_RENDERED_PIXELS = 4_000_000

export const DEFAULT_WIDTH_PX = 800
export const DEFAULT_HEIGHT_PX = 600
export const DEFAULT_PIXEL_RATIO = 1
export const DEFAULT_PADDING_PX = 20
// Matches the map component's default view limits.
const MIN_ZOOM = 5
const MAX_ZOOM = 20

// #1d7, #11dd77 or #11dd77ff (the last includes transparency)
const HEX_COLOUR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const colourSchema = z.string().regex(HEX_COLOUR_PATTERN, 'Must be a hex colour such as #11dd77')

const lineDashSchema = z.array(z.number().positive()).min(1).max(8)

const latitudeSchema = z.number().min(-90).max(90)
const longitudeSchema = z.number().min(-180).max(180)

const pointSchema = z.strictObject({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
})

const circlePointSchema = pointSchema.extend({
  precision: z.number().positive().max(100_000),
})

// Direction of travel in degrees, used to extend a track at its ends
const bearingSchema = z.number().min(0).max(360)

const trackPointSchema = pointSchema.extend({
  entryBearing: bearingSchema.optional(),
  exitBearing: bearingSchema.optional(),
})

const textPointSchema = pointSchema.extend({
  label: z.string().trim().min(1).max(100),
})

const pointsOf = <T extends z.ZodType>(point: T, min = 1) => z.array(point).min(min).max(MAX_POINTS_PER_LAYER)

// A line needs two points to have a segment
const MIN_LINE_POINTS = 2

const layerIdSchema = z.string().trim().min(1).max(64)

export const DEFAULT_EXTENSION_METRES = 50

const entryExitSchema = z.strictObject({
  extensionMetres: z.number().positive().max(10_000).optional(),
  // Extends the ends of the track beyond the edge of this circle instead of from the end point
  extendBeyond: z
    .strictObject({
      centre: z.strictObject({ latitude: latitudeSchema, longitude: longitudeSchema }),
      radiusMetres: z.number().positive().max(100_000),
    })
    .optional(),
})

const tracksLayerSchema = z.strictObject({
  type: z.literal('tracks'),
  id: layerIdSchema,
  points: pointsOf(trackPointSchema, MIN_LINE_POINTS),
  style: z
    .strictObject({
      stroke: z.strictObject({ color: colourSchema.optional(), lineDash: lineDashSchema.optional() }).optional(),
    })
    .optional(),
  entryExit: entryExitSchema.optional(),
})

const linesLayerSchema = z.strictObject({
  type: z.literal('lines'),
  id: layerIdSchema,
  points: pointsOf(pointSchema, MIN_LINE_POINTS),
  style: z.strictObject({ stroke: z.strictObject({ color: colourSchema.optional() }).optional() }).optional(),
})

const circlesLayerSchema = z.strictObject({
  type: z.literal('circles'),
  id: layerIdSchema,
  points: pointsOf(circlePointSchema),
  style: z
    .strictObject({
      fill: colourSchema.nullable().optional(),
      stroke: z
        .strictObject({
          color: colourSchema.optional(),
          width: z.number().positive().max(20).optional(),
          lineDash: lineDashSchema.optional(),
        })
        .optional(),
    })
    .optional(),
})

const locationMarkerSchema = z.strictObject({
  // circle is the only marker for now; it is optional so a bare marker style needs no type
  type: z.literal('circle').optional(),
  radius: z.number().positive().max(50).optional(),
  fill: colourSchema.optional(),
  stroke: z
    .strictObject({ color: colourSchema.optional(), width: z.number().positive().max(20).optional() })
    .optional(),
})

const locationsLayerSchema = z.strictObject({
  type: z.literal('locations'),
  id: layerIdSchema,
  points: pointsOf(pointSchema),
  // style is an alternative for marker, consistent with the other layer types; marker wins if both are sent
  marker: locationMarkerSchema.optional(),
  style: locationMarkerSchema.optional(),
})

const textLayerSchema = z.strictObject({
  type: z.literal('text'),
  id: layerIdSchema,
  points: pointsOf(textPointSchema),
  style: z
    .strictObject({
      color: colourSchema.optional(),
      haloColor: colourSchema.optional(),
      haloWidth: z.number().min(0).max(20).optional(),
      size: z.number().min(6).max(72).optional(),
    })
    .optional(),
})

const layerSchema = z.discriminatedUnion('type', [
  tracksLayerSchema,
  linesLayerSchema,
  circlesLayerSchema,
  locationsLayerSchema,
  textLayerSchema,
])

// Shown only when the caller supplies the wording; there is no default text.
const attributionSchema = z.string().trim().min(1).max(MAX_ATTRIBUTION_LENGTH)

const outputSchema = z
  .strictObject({
    width: z.int().min(MIN_OUTPUT_PX).max(MAX_OUTPUT_PX).optional(),
    height: z.int().min(MIN_OUTPUT_PX).max(MAX_OUTPUT_PX).optional(),
    format: z.enum(['jpeg', 'png']).optional(),
    quality: z.int().min(1).max(100).optional(),
    pixelRatio: z.number().min(1).max(MAX_PIXEL_RATIO).optional(),
    attribution: attributionSchema.optional(),
  })
  .refine(output => output.format !== 'png' || output.quality === undefined, {
    message: 'quality only applies to jpeg',
    path: ['quality'],
  })

const fitViewportSchema = z.strictObject({
  mode: z.literal('fit'),
  // Defaults to every layer. All supplied layers are drawn either way.
  fitToLayerIds: z.array(layerIdSchema).min(1).max(MAX_LAYERS).optional(),
  padding: z.number().min(0).max(500).optional(),
  maxZoom: z.number().min(MIN_ZOOM).max(MAX_ZOOM).optional(),
})

const explicitViewportSchema = z.strictObject({
  mode: z.literal('explicit'),
  centre: z.strictObject({ latitude: latitudeSchema, longitude: longitudeSchema }),
  zoom: z.number().min(MIN_ZOOM).max(MAX_ZOOM),
})

// Omitting viewport fits to the layers; if sent, it must say which mode it is.
const viewportSchema = z.discriminatedUnion('mode', [fitViewportSchema, explicitViewportSchema])

const mapRenderSchema = z
  .strictObject({
    output: outputSchema.optional(),
    viewport: viewportSchema.optional(),
    layers: z
      .array(layerSchema)
      .max(MAX_LAYERS)
      .refine(layers => new Set(layers.map(layer => layer.id)).size === layers.length, {
        message: 'Layer ids must be unique',
      })
      .default([]),
  })
  .refine(request => request.layers.length > 0 || request.viewport?.mode === 'explicit', {
    message: 'At least one layer is required unless the viewport is explicit',
    path: ['layers'],
  })
  .refine(request => request.layers.reduce((total, layer) => total + layer.points.length, 0) <= MAX_TOTAL_POINTS, {
    message: `No more than ${MAX_TOTAL_POINTS} points in total across all layers`,
    path: ['layers'],
  })
  .refine(
    request => {
      const width = request.output?.width ?? DEFAULT_WIDTH_PX
      const height = request.output?.height ?? DEFAULT_HEIGHT_PX
      const pixelRatio = request.output?.pixelRatio ?? DEFAULT_PIXEL_RATIO

      return width * pixelRatio * (height * pixelRatio) <= MAX_RENDERED_PIXELS
    },
    {
      message: `Image is too large once pixelRatio is applied (maximum ${MAX_RENDERED_PIXELS} pixels)`,
      path: ['output'],
    },
  )
  .refine(
    request => {
      if (request.viewport?.mode !== 'fit' || !request.viewport.fitToLayerIds) return true

      const layerIds = new Set(request.layers.map(layer => layer.id))

      return request.viewport.fitToLayerIds.every(id => layerIds.has(id))
    },
    { message: 'fitToLayerIds must only list ids of supplied layers', path: ['viewport', 'fitToLayerIds'] },
  )
  .refine(
    request => {
      if (request.viewport?.mode === 'explicit') return true

      const padding = request.viewport?.padding ?? DEFAULT_PADDING_PX
      const smallestSide = Math.min(
        request.output?.width ?? DEFAULT_WIDTH_PX,
        request.output?.height ?? DEFAULT_HEIGHT_PX,
      )

      return padding * 2 < smallestSide
    },
    { message: 'Padding must be less than half of the smallest image side', path: ['viewport', 'padding'] },
  )

export type MapRenderRequest = z.infer<typeof mapRenderSchema>
export type MapRenderLayer = MapRenderRequest['layers'][number]

export default mapRenderSchema
