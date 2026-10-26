import type { Position } from '@ministryofjustice/hmpps-electronic-monitoring-components/map'
import type {
  CirclesLayerOptions,
  LinesLayerOptions,
  LocationsLayerOptions,
  TextLayerOptions,
  TracksLayerOptions,
} from '@ministryofjustice/hmpps-electronic-monitoring-components/map/layers'
import type { MapRenderLayer, MapRenderRequest } from '../schemas/mapRender'
import {
  DEFAULT_EXTENSION_METRES,
  DEFAULT_HEIGHT_PX,
  DEFAULT_PADDING_PX,
  DEFAULT_PIXEL_RATIO,
  DEFAULT_WIDTH_PX,
} from '../schemas/mapRender'

const DEFAULT_BLUE = '#1d70b8'
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const DEFAULT_MAX_ZOOM = 18
const DEFAULT_FORMAT = 'jpeg'
const DEFAULT_JPEG_QUALITY = 90
const DEFAULT_FONT_FAMILY = '"GDS Transport", system-ui, sans-serif'
const DEFAULT_TEXT_SIZE_PX = 14

// Only circles use precision, but the component's Position type requires it.
const UNUSED_PRECISION = 0

export type PresentedLayer =
  | { type: 'tracks'; options: TracksLayerOptions }
  | { type: 'lines'; options: LinesLayerOptions }
  | { type: 'circles'; options: CirclesLayerOptions }
  | { type: 'locations'; options: LocationsLayerOptions }
  | { type: 'text'; options: TextLayerOptions }

export type MapRenderModel = {
  output: {
    width: number
    height: number
    format: 'jpeg' | 'png'
    quality?: number
    pixelRatio: number
  }
  viewport:
    | { mode: 'fit'; layerIds: string[]; padding: number; maxZoom: number }
    | { mode: 'explicit'; centre: { latitude: number; longitude: number }; zoom: number }
  layers: PresentedLayer[]
  fonts: string[]
  attribution?: string
}

type StrokeDefaults = { color: string; width: number; lineDash?: number[] }

// Names of the Position fields the component reads track bearings from
const ENTRY_BEARING_PROPERTY = 'entryBearing'
const EXIT_BEARING_PROPERTY = 'exitBearing'

const presentPositions = (
  points: Array<{
    latitude: number
    longitude: number
    precision?: number
    label?: string
    entryBearing?: number
    exitBearing?: number
  }>,
): Position[] =>
  points.map(({ latitude, longitude, precision, label, entryBearing, exitBearing }) => ({
    latitude,
    longitude,
    precision: precision ?? UNUSED_PRECISION,
    ...(label === undefined ? {} : { label }),
    ...(entryBearing === undefined ? {} : { [ENTRY_BEARING_PROPERTY]: entryBearing }),
    ...(exitBearing === undefined ? {} : { [EXIT_BEARING_PROPERTY]: exitBearing }),
  }))

const presentEntryExit = (entryExit: NonNullable<Extract<MapRenderLayer, { type: 'tracks' }>['entryExit']>) => ({
  enabled: true,
  extensionDistanceMeters: entryExit.extensionMetres ?? DEFAULT_EXTENSION_METRES,
  direction: { property: { entry: ENTRY_BEARING_PROPERTY, exit: EXIT_BEARING_PROPERTY }, units: 'degrees' as const },
  ...(entryExit.extendBeyond
    ? {
        centre: [entryExit.extendBeyond.centre.longitude, entryExit.extendBeyond.centre.latitude] as [number, number],
        radiusMeters: entryExit.extendBeyond.radiusMetres,
      }
    : {}),
})

const presentLayer = (layer: MapRenderLayer, index: number): PresentedLayer => {
  // Draw order is array order
  const common = { id: layer.id, zIndex: index, visible: true }

  switch (layer.type) {
    case 'tracks':
      return {
        type: 'tracks',
        options: {
          ...common,
          positions: presentPositions(layer.points),
          style: {
            stroke: {
              color: layer.style?.stroke?.color ?? DEFAULT_BLUE,
              ...(layer.style?.stroke?.lineDash ? { lineDash: layer.style.stroke.lineDash } : {}),
            },
          },
          ...(layer.entryExit ? { entryExit: presentEntryExit(layer.entryExit) } : {}),
        },
      }

    case 'lines':
      return {
        type: 'lines',
        options: {
          ...common,
          positions: presentPositions(layer.points),
          style: { stroke: { color: layer.style?.stroke?.color ?? DEFAULT_BLUE } },
        },
      }

    case 'circles': {
      const stroke: StrokeDefaults = {
        color: layer.style?.stroke?.color ?? DEFAULT_BLUE,
        width: layer.style?.stroke?.width ?? 2,
        ...(layer.style?.stroke?.lineDash ? { lineDash: layer.style.stroke.lineDash } : {}),
      }

      return {
        type: 'circles',
        options: {
          ...common,
          positions: presentPositions(layer.points),
          style: {
            // null means outline only, which the component needs as a transparent fill
            fill: layer.style?.fill === null ? TRANSPARENT : (layer.style?.fill ?? 'rgba(29, 112, 184, 0.15)'),
            stroke,
          },
        },
      }
    }

    case 'locations': {
      const marker = { ...layer.style, ...layer.marker }
      return {
        type: 'locations',
        options: {
          ...common,
          // Marker buttons are DOM overlays that only matter to interactive users.
          accessibleMarkers: false,
          renderer: 'auto',
          positions: presentPositions(layer.points),
          style: {
            radius: marker.radius ?? 6,
            fill: marker.fill ?? DEFAULT_BLUE,
            stroke: { color: marker.stroke?.color ?? '#ffffff', width: marker.stroke?.width ?? 2 },
          },
        },
      }
    }

    case 'text': {
      const haloWidth = layer.style?.haloWidth ?? 3

      return {
        type: 'text',
        options: {
          ...common,
          textProperty: 'label',
          positions: presentPositions(layer.points),
          style: {
            fill: layer.style?.color ?? '#0b0c0c',
            font: `bold ${layer.style?.size ?? DEFAULT_TEXT_SIZE_PX}px ${DEFAULT_FONT_FAMILY}`,
            // The map component always draws a text stroke (defaulting when omitted), and a zero width can be
            // ignored by canvas, so a transparent stroke is how to get no halo.
            stroke:
              haloWidth > 0
                ? { color: layer.style?.haloColor ?? '#ffffff', width: haloWidth }
                : { color: 'rgba(0, 0, 0, 0)', width: 1 },
            offset: { x: 0, y: 0 },
            textAlign: 'center',
          },
        },
      }
    }

    default:
      throw new Error(`Unsupported layer type: ${(layer as { type: string }).type}`)
  }
}

const presentViewport = (
  viewport: MapRenderRequest['viewport'],
  layers: MapRenderLayer[],
): MapRenderModel['viewport'] => {
  if (viewport?.mode === 'explicit') {
    return { mode: 'explicit', centre: viewport.centre, zoom: viewport.zoom }
  }

  return {
    mode: 'fit',
    layerIds: viewport?.fitToLayerIds ?? layers.map(layer => layer.id),
    padding: viewport?.padding ?? DEFAULT_PADDING_PX,
    maxZoom: viewport?.maxZoom ?? DEFAULT_MAX_ZOOM,
  }
}

const presentMapRender = ({ output = {}, viewport, layers }: MapRenderRequest): MapRenderModel => {
  const format = output.format ?? DEFAULT_FORMAT
  const presentedLayers = layers.map(presentLayer)

  const fonts = [
    ...new Set(
      presentedLayers.flatMap(layer =>
        layer.type === 'text' && layer.options.style?.font ? [layer.options.style.font] : [],
      ),
    ),
  ]

  return {
    output: {
      width: output.width ?? DEFAULT_WIDTH_PX,
      height: output.height ?? DEFAULT_HEIGHT_PX,
      format,
      pixelRatio: output.pixelRatio ?? DEFAULT_PIXEL_RATIO,
      ...(format === 'jpeg' ? { quality: output.quality ?? DEFAULT_JPEG_QUALITY } : {}),
    },
    viewport: presentViewport(viewport, layers),
    layers: presentedLayers,
    fonts,
    ...(output.attribution ? { attribution: output.attribution } : {}),
  }
}

export default presentMapRender
