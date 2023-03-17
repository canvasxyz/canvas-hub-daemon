import path from "node:path"
import net from "node:net"
import fs from "node:fs"

import { PEER_ID_FILENAME } from "@canvas-js/core/constants"

export const CANVAS_HOME = process.env.CANVAS_HOME ?? path.resolve("data")

// remove old files that have been deprecated
for (const name of fs.readdirSync(CANVAS_HOME)) {
  if (name === "daemon.sock" || name === PEER_ID_FILENAME) {
    fs.rmSync(path.resolve(CANVAS_HOME, name))
    continue
  }
}
