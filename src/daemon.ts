import http from "node:http"
import fs from "node:fs"
import path from "node:path"

import { StatusCodes } from "http-status-codes"
import express from "express"
import winston from "winston"
import expressWinston from "express-winston"
import cors from "cors"
import stoppable from "stoppable"
import Hash from "ipfs-only-hash"
import PQueue from "p-queue"
import client from "prom-client"

import { Core, getAPI, CoreOptions } from "@canvas-js/core"
import { VM } from "@canvas-js/core/components/vm"
import { SPEC_FILENAME } from "@canvas-js/core/constants"
import type { ChainImplementation, Model } from "@canvas-js/interfaces"

import { CANVAS_HOME } from "./utils.js"

type Status = "running" | "stopped"

type AppData = {
  uri: string
  cid: string
  status: Status
  appName?: string
  models?: Record<string, Model>
  actions?: string[]
}

const { FLY_APP_NAME, START_PORT, END_PORT } = process.env

export class Daemon {
  public readonly app = express()
  public readonly server: http.Server & stoppable.WithStop

  private readonly queue = new PQueue({ concurrency: 1 })
  private readonly apps = new Map<string, { port?: number; core: Core; api: express.Express }>()
  private readonly portMap = new Map<number, string>()
  private lastAllocatedPort = NaN

  public constructor(
    private readonly chains: ChainImplementation[],
    options: CoreOptions
  ) {
    this.app.use(express.json())
    this.app.use(express.text())
    this.app.use(cors())

    this.app.use(
      expressWinston.logger({
        transports: [new winston.transports.Console()],
        format: winston.format.simple(),
        colorize: false,

        // /app/ is noisy, so don't log it
        ignoreRoute: (req, res) => req.path === "/app/" && res.statusCode == StatusCodes.OK,
      })
    )

    this.app.get("/app", (req, res) => {
      this.queue.add(async () => {
        const apps: Record<string, AppData> = {}
        for (const name of fs.readdirSync(CANVAS_HOME)) {
          const specPath = path.resolve(CANVAS_HOME, name, SPEC_FILENAME)
          if (fs.existsSync(specPath)) {
            const spec = fs.readFileSync(specPath, "utf-8")
            const cid = await Hash.of(spec)
            const uri = `ipfs://${cid}`

            const app = this.apps.get(name)
            if (app) {
              const { appName, models, actions } = app.core.vm
              apps[name] = { uri, cid, status: "running", appName, models, actions }
            } else {
              apps[name] = { uri, cid, status: "stopped" }
            }
          } else {
            console.warn(`[canvas-core-daemon] unexpected file in home directory: ${name}`)
          }
        }

        res.json(apps)
      })
    })

    this.app.put("/app/:name", (req, res) => {
      const { name } = req.params
      if (typeof req.body !== "string") {
        return res.status(StatusCodes.NOT_ACCEPTABLE).end()
      }

      this.queue.add(async () => {
        const directory = path.resolve(CANVAS_HOME, name)
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory)
        }

        const specPath = path.resolve(CANVAS_HOME, name, SPEC_FILENAME)
        if (fs.existsSync(specPath)) {
          return res.status(StatusCodes.CONFLICT).end()
        }

        fs.writeFileSync(specPath, req.body)
        res.status(StatusCodes.OK).end()
      })
    })

    this.app.delete("/app/:name", (req, res) => {
      const { name } = req.params

      this.queue.add(() => {
        const directory = path.resolve(CANVAS_HOME, name)
        if (!fs.existsSync(directory)) {
          return res.status(StatusCodes.NOT_FOUND).end()
        }

        if (this.apps.has(name)) {
          return res.status(StatusCodes.CONFLICT).end()
        }

        fs.rmSync(directory, { recursive: true })
        res.status(StatusCodes.OK).end()
      })
    })

    this.app.post("/app/:name/start", async (req, res) => {
      const { name } = req.params

      this.queue.add(async () => {
        const directory = path.resolve(CANVAS_HOME, name)
        if (!fs.existsSync(directory)) {
          return res.status(StatusCodes.NOT_FOUND).end()
        }

        if (this.apps.has(name)) {
          return res.status(StatusCodes.CONFLICT).end()
        }

        const specPath = path.resolve(CANVAS_HOME, name, SPEC_FILENAME)
        if (!fs.existsSync(specPath)) {
          return res.status(StatusCodes.NOT_FOUND).end()
        }

        const spec = fs.readFileSync(specPath, "utf-8")

        try {
          let listen: number | undefined = undefined
          let announce: string[] | undefined = undefined
          if (FLY_APP_NAME && START_PORT && END_PORT) {
            const [start, end] = [parseInt(START_PORT), parseInt(END_PORT)]
            listen = this.lastAllocatedPort || start
            let loop = false
            while (this.portMap.has(listen)) {
              listen += 1
              if (listen > end) {
                if (loop) {
                  throw new Error("could not assign port")
                } else {
                  loop = true
                  listen = start
                }
              }
            }

            this.lastAllocatedPort = listen
            announce = [`/dns4/${FLY_APP_NAME}.fly.dev/tcp/${listen}/ws`]
          }

          const core = await Core.initialize({ directory, spec, chains: this.chains, listen, announce, ...options })
          console.log(`[canvas-hub-daemon] Started ${name} (${core.app})`)

          const api = getAPI(core, {
            exposeModels: true,
            exposeMetrics: false,
            exposeMessages: true,
          })

          this.apps.set(name, { port: listen, core, api })
          if (listen) {
            this.portMap.set(listen, name)
          }

          res.status(StatusCodes.OK).end()
        } catch (err) {
          if (err instanceof Error) {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).end(err.message)
          } else {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).end()
          }
        }
      })
    })

    this.app.post("/app/:name/stop", (req, res) => {
      const { name } = req.params

      this.queue.add(async () => {
        const app = this.apps.get(name)
        if (app === undefined) {
          return res.status(StatusCodes.CONFLICT).end()
        }

        try {
          await app.core.close()
          console.log(`[canvas-hub-daemon] Stopped ${name} (${app.core.app})`)
          res.status(StatusCodes.OK).end()
        } catch (err) {
          if (err instanceof Error) {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).end(err.message)
          } else {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).end()
          }
        } finally {
          this.apps.delete(name)
          if (app.port) {
            this.portMap.delete(app.port)
          }
        }
      })
    })

    this.app.use("/app/:name", (req, res, next) => {
      const { name } = req.params

      this.queue.add(async () => {
        const app = this.apps.get(name)
        if (app === undefined) {
          return res.status(StatusCodes.NOT_FOUND).end()
        }

        return app.api(req, res, next)
      })
    })

    this.app.post("/check", (req, res) => {
      if (typeof req.body.app !== "string") {
        return res.status(StatusCodes.BAD_REQUEST).end()
      }

      const app = req.body.app

      this.queue.add(async () => {
        try {
          const result = await VM.validate(app)
          res.status(StatusCodes.OK).json(result)
        } catch (err) {
          // we return INTERNAL_SERVER_ERROR since validation errors shouldn't throw
          if (err instanceof Error) {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).end(err.message)
          } else {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).end()
          }
        }
      })
    })

    this.app.get("/metrics", async (req, res) => {
      try {
        const result = await client.register.metrics()
        res.header("Content-Type", client.register.contentType)
        return res.end(result)
      } catch (err) {
        if (err instanceof Error) {
          res.status(StatusCodes.INTERNAL_SERVER_ERROR).end(err.message)
        } else {
          res.status(StatusCodes.INTERNAL_SERVER_ERROR).end()
        }
      }
    })

    this.server = stoppable(http.createServer(this.app))
  }

  public listen(port: number) {
    this.server.listen(port, () => {
      console.log(`[canvas-hub-daemon] Serving Daemon API on http://127.0.0.1:${port}/`)
    })
  }

  public async close() {
    console.log("[canvas-hub-daemon] Waiting for queue to clear")
    await this.queue.onIdle()
    console.log("[canvas-hub-daemon] Stopping running apps")
    await Promise.all(([...this.apps.values()].map(({ core }) => core.close())))
    console.log("[canvas-hub-daemon] Stopping Daemon API server")
    await new Promise<void>((resolve, reject) => this.server.stop((err) => err ? reject(err) : resolve()))
  }
}
