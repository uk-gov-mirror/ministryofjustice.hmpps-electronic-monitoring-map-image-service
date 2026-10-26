import crypto from 'crypto'
import express, { Router, Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import { IncomingMessage, ServerResponse } from 'http'
import config from '../config'

export default function setUpWebSecurity(): Router {
  const router = express.Router()

  // Secure code best practice - see:
  // 1. https://expressjs.com/en/advanced/best-practice-security.html,
  // 2. https://www.npmjs.com/package/helmet
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('hex')
    next()
  })
  router.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // This nonce allows us to use scripts with the use of the `cspNonce` local, e.g (in a Nunjucks template):
          // <script nonce="{{ cspNonce }}">
          // or
          // <link href="http://example.com/" rel="stylesheet" nonce="{{ cspNonce }}">
          // This ensures only scripts we trust are loaded, and not anything injected into the
          // page by an attacker.
          scriptSrc: [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) => `'nonce-${(res as Response).locals.cspNonce}'`,
          ],
          styleSrc: [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) => `'nonce-${(res as Response).locals.cspNonce}'`,
          ],
          fontSrc: ["'self'"],
          workerSrc: ["'self'", 'blob:'],
          // The map component sets attributes such as `style.cursor`/`style.display`/positioning transforms directly via JS (standard behaviour
          // for OpenLayers/MapLibre). 'unsafe-inline' is therefore required here, but it is scoped to
          // attribute mutations only - it does not re-open the door to injected <style> elements or
          // external stylesheets, which remain locked down by styleSrc above.
          // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr for more information.
          styleSrcAttr: ["'unsafe-inline'"],
          formAction: [`'self' ${config.apis.hmppsAuth.externalUrl}`],
          ...(config.production ? {} : { upgradeInsecureRequests: null }),
        },
      },
      crossOriginEmbedderPolicy: true,
    }),
  )
  return router
}
