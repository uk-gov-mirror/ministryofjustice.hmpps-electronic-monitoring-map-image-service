import type { EmMap } from '@ministryofjustice/hmpps-electronic-monitoring-components/map'
import '@ministryofjustice/hmpps-electronic-monitoring-components/map'
import {
  CirclesLayer,
  LinesLayer,
  LocationsLayer,
  TextLayer,
  TracksLayer,
} from '@ministryofjustice/hmpps-electronic-monitoring-components/map/layers'
import type { ComposableLayer } from '@ministryofjustice/hmpps-electronic-monitoring-components/map/layers'
import { fromLonLat } from 'ol/proj'
import type { MapRenderModel, PresentedLayer } from '../../server/presenters/mapRender'

const createLayer = (layer: PresentedLayer): ComposableLayer<unknown> => {
  switch (layer.type) {
    case 'tracks':
      return new TracksLayer(layer.options)
    case 'lines':
      return new LinesLayer(layer.options)
    case 'circles':
      return new CirclesLayer(layer.options)
    case 'locations':
      return new LocationsLayer(layer.options)
    case 'text':
      return new TextLayer(layer.options)
    default:
      throw new Error(`Unsupported layer type: ${(layer as { type: string }).type}`)
  }
}

const waitForMapReady = (emMap: EmMap): Promise<void> =>
  new Promise(resolve => {
    if (emMap.olMapInstance) {
      resolve()
      return
    }
    emMap.addEventListener('map:ready', () => resolve(), { once: true })
  })

const applyViewport = (emMap: EmMap, model: MapRenderModel) => {
  const { viewport } = model

  if (viewport.mode === 'explicit') {
    const view = emMap.olMapInstance!.getView()
    view.setCenter(fromLonLat([viewport.centre.longitude, viewport.centre.latitude]))
    view.setZoom(viewport.zoom)
    return
  }

  const fitted = emMap.fitToLayers(viewport.layerIds, {
    padding: viewport.padding,
    maxZoom: viewport.maxZoom,
    animate: false,
  })

  if (!fitted) {
    throw new Error('Could not fit the map to the supplied layers')
  }
}

// Resolves once OpenLayers has finished drawing, including tiles
const waitForRenderComplete = (emMap: EmMap): Promise<void> =>
  new Promise(resolve => {
    const map = emMap.olMapInstance!
    map.once('rendercomplete', () => resolve())
    map.renderSync()
  })

const renderMap = async (model: MapRenderModel): Promise<void> => {
  const emMap = document.querySelector('em-map') as EmMap | null
  if (!emMap) {
    throw new Error('em-map element not found')
  }

  await waitForMapReady(emMap)

  if (model.attribution) {
    emMap.setAttribution(model.attribution)
  }

  // Text falls back to another font unless the font face is loaded first
  await Promise.all(model.fonts.map(font => document.fonts.load(font)))

  model.layers.forEach(layer => emMap.addLayer(createLayer(layer)))

  applyViewport(emMap, model)
  await waitForRenderComplete(emMap)
}

declare global {
  interface Window {
    renderMap: typeof renderMap
  }
}

window.renderMap = renderMap
