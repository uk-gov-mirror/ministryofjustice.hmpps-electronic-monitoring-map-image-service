import { AuditServiceFactory } from '@ministryofjustice/hmpps-audit-client'
import { dataAccess } from '../data'
import logger from '../../logger'
import config from '../config'
import MapRendererService from './mapRendererService'
import PlaywrightBrowserService from './playwrightBrowserService'

export const services = () => {
  const { applicationInfo } = dataAccess()

  const auditService = AuditServiceFactory.createInstance(config.sqs.audit, logger)

  const playwrightBrowserService = new PlaywrightBrowserService()
  const mapRendererService = new MapRendererService(playwrightBrowserService)

  return {
    applicationInfo,
    auditService,
    playwrightBrowserService,
    mapRendererService,
  }
}

export type Services = ReturnType<typeof services>
