# hmpps-electronic-monitoring-map-image-service

[![Ministry of Justice Repository Compliance Badge](https://github-community.service.justice.gov.uk/repository-standards/api/hmpps-electronic-monitoring-map-image-service/badge?style=flat)](https://github-community.service.justice.gov.uk/repository-standards/hmpps-electronic-monitoring-map-image-service)
[![Docker Repository on ghcr](https://img.shields.io/badge/ghcr.io-repository-2496ED.svg?logo=docker)](https://ghcr.io/ministryofjustice/hmpps-electronic-monitoring-map-image-service)

Service that renders map images for the Electronic Monitoring Crime Matching service, using the Electronic Monitoring map component in headless Chromium.

Our security policy is located [here](https://github.com/ministryofjustice/hmpps-electronic-monitoring-map-image-service/security/policy).

## Map rendering

The service renders map images using the `@ministryofjustice/hmpps-electronic-monitoring-components` map in headless Chromium (Playwright).

### Request contract

Everything is optional except that a request with no layers must have an explicit viewport.

```json
{
  "output": {
    "width": 800,
    "height": 600,
    "format": "jpeg",
    "quality": 90,
    "pixelRatio": 1,
    "attribution": "Contains OS data © Crown copyright"
  },
  "viewport": { "mode": "fit", "padding": 20, "maxZoom": 18 },
  "layers": [
    {
      "type": "tracks",
      "id": "route",
      "points": [
        { "latitude": 51.5, "longitude": -0.12 },
        { "latitude": 51.52, "longitude": -0.09 }
      ],
      "style": { "stroke": { "color": "#d4351c", "lineDash": [10, 8] } }
    }
  ]
}
```

| Field                 | Default       | Notes                                                                                                                                                                                                                                                                     |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `output.width/height` | 800 x 600     | 100-2000 px each. Width x height x pixelRatio² must not exceed 4,000,000 pixels.                                                                                                                                                                                          |
| `output.format`       | `jpeg`        | `jpeg` or `png`.                                                                                                                                                                                                                                                          |
| `output.quality`      | 90            | 1-100, jpeg only.                                                                                                                                                                                                                                                         |
| `output.pixelRatio`   | 1             | 1-2. The image is `width x pixelRatio` pixels wide.                                                                                                                                                                                                                       |
| `output.attribution`  | none          | Plain text, 1-200 characters. See below.                                                                                                                                                                                                                                  |
| `viewport`            | fit to layers | If sent it must include `mode`. `fit` takes `padding` (0-500, default 20), `maxZoom` (5-20, default 18) and optional `fitToLayerIds` (ids of supplied layers to fit to; all are still drawn, and circle radii are included). `explicit` takes `centre` and `zoom` (5-20). |
| `layers`              | `[]`          | At most 20 layers with unique ids, 5,000 points per layer and 10,000 points in total.                                                                                                                                                                                     |

Colours are hex (`#1d7`, `#11dd77` or `#11dd77ff`).

Only the layers supplied are drawn, and the map fits to those layers' points by default.

### Layer types

| Type        | Points                                                  | Styling                                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tracks`    | At least 2 `{ latitude, longitude }`                    | `style.stroke.color`, `style.stroke.lineDash` for a dashed track. Draws direction arrows. Points may have `entryBearing`/`exitBearing` (0-360). Optional `entryExit: { extensionMetres?, extendBeyond?: { centre, radiusMetres } }` extends the track at its ends (default 50 m). |
| `lines`     | At least 2 `{ latitude, longitude }`                    | `style.stroke.color`. A plain solid line with no arrows.                                                                                                                                                                                                                          |
| `circles`   | `{ latitude, longitude, precision }` (radius in metres) | `style.fill` (`null` for an outline only), `style.stroke.color`, `.width` and `.lineDash`.                                                                                                                                                                                        |
| `locations` | `{ latitude, longitude }`                               | `marker`: `{ type: "circle", radius, fill, stroke: { color, width } }`. `circle` is the only type. `style` is accepted as an alias for `marker`; `marker` wins if both are sent.                                                                                                  |
| `text`      | `{ latitude, longitude, label }`                        | `style.color`, `.size`, `.haloColor` and `.haloWidth` (0 for no halo).                                                                                                                                                                                                            |

Layers are drawn in array order: the first layer is at the bottom and the last on top. There is no separate z-index in the contract, so reorder the layers to change the stacking (for example, put `text` last so labels are not hidden by `locations`).

### Attribution

The map has no default attribution. If the image is published or shown to users, the caller is responsible for supplying any attribution wording the map data licence requires in `output.attribution`.

### Testing map rendering

`integration_tests/specs/mapRender.spec.ts` renders real JPEG and PNG images through Chromium. Run it with the app and wiremock started as described in [Running integration tests](#running-integration-tests):

`npx playwright test mapRender`

The map tiles are stubbed, so the base map is a plain background and the layers are what you see. Each layer type's image is attached to the Playwright report (`npx playwright show-report`).

## Oauth2 Credentials

The service is set up to run with two sets of credentials, each one support a different oauth2 flows.
These need to be requested from the auth team by filling in
this [template](https://dsdmoj.atlassian.net/browse/HAAR-140) and raising on their slack channel.

### Auth Code flow

These are used to allow authenticated users to access the application. After the user is redirected from auth back to
the application, the typescript app will use the returned auth code to request a JWT token for that user containing the
user's roles. The JWT token will be verified and then stored in the user's session.

These credentials are configured using the following env variables:

- AUTH_CODE_CLIENT_ID
- AUTH_CODE_CLIENT_SECRET

### Client Credentials flow

These are used by the application to request tokens to make calls to APIs. These are system accounts that will have
their own sets of roles.

Most API calls that occur as part of the request/response cycle will be on behalf of a user.
To make a call on behalf of a user, a username should be passed when requesting a system token. The username will then
become part of the JWT and can be used downstream for auditing purposes.

These tokens are cached until expiration.

These credentials are configured using the following env variables:

- CLIENT_CREDS_CLIENT_ID
- CLIENT_CREDS_CLIENT_SECRET

### Dependencies

### HMPPS Auth

To allow authenticated users to access your application you need to point it to a running instance of `hmpps-auth`.
By default the application is configured to run against an instance running in docker that can be started
via `docker-compose`.

**NB:** It's common for developers to run against the instance of auth running in the development/T3 environment for
local development.
Most APIs don't have images with cached data that you can run with docker: setting up realistic stubbed data in sync
across a variety of services is very difficult.

### REDIS

When deployed to an environment with multiple pods we run applications with an instance of REDIS/Elasticache to provide
a distributed cache of sessions.
The app is, by default, configured not to use REDIS when running locally.

## Development

### Running the app via docker-compose

The easiest way to run the app is to use docker compose to create the service and all dependencies.

The production image now uses the `hmpps-node:24-alpine-runtime` base image and starts with `node dist/server.js` directly, so npm is not present in the final runtime stage.

`docker compose pull`

`docker compose up`

### Running the app for development

To start the main services excluding the app:

`docker compose up --scale=app=0`

Create an environment file by copying `.env.example` -> `.env`
Environment variables set in here will be available when running `start:dev`

Install dependencies using `npm run setup`, ensuring you are using `node v24`

Note: Using `nvm` (or [fnm](https://github.com/Schniz/fnm)), run `nvm install --latest-npm` within the repository folder
to use the correct version of node, and the latest version of npm. This matches the `engines` config in `package.json`
and the github pipeline build config.

And then, to build the assets and start the app with esbuild:

`npm run start:dev`

### Logging in with a test user

Once the application is running you should then be able to login with:

username: AUTH_USER
password: password123456

To request specific users and roles then raise a PR
to [update the seed data](https://github.com/ministryofjustice/hmpps-auth/blob/main/src/main/resources/db/dev/data/auth/V900_3__users.sql)
for the in-memory DB used by Auth

### Installing dependencies

By default no pre or post install scripts will be run during `npm install`.
Instead a list of configured install scripts will be run via the [npm script allowlist](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/npm-script-allowlist) tool.

Instead of running `npm install`, run `npm run setup` - this will run an `npm ci` to install any dependencies and then run any configured install scripts.

### Making changes

The [hmpps precommit hooks library](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/precommit-hooks) will ensure that [prek](https://prek.j178.dev/cli/) is installed and initialised against the repo as part of `npm run setup`.

This will run a set of precommit hooks before every commit as configured in `.pre-commit-config.yaml`.
This will scan for potential secrets in the staged files and fail the commit if any are detected.

There's some guidance for dealing with false positives in the [precommit hooks docs](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/precommit-hooks#dealing-with-false-positives).

The secret scanner hook can also be configured as described [here](https://github.com/ministryofjustice/devsecops-hooks?tab=readme-ov-file#-configuration).

### Run linter

- `npm run lint` runs `eslint`.
- `npm run typecheck` runs the TypeScript compiler `tsc`.

### Run unit tests

`npm run test`

### Running integration tests

For local running, start a wiremock instance by:

`docker compose -f docker-compose-test.yml up`

Then run the server in test mode by:

`npm run start-feature` (or `npm run start-feature:dev` to run with auto-restart on changes)

After first install ensure playwright is initialised:

`npm run int-test-init:ci`

And then either, run tests in headless mode with:

`npm run int-test`

Or run tests with the UI:

`npm run int-test-ui`

## Change log

A changelog for the service is available [here](./CHANGELOG.md)
