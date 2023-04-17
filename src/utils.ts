import path from "node:path"
import fs from "node:fs"
import stream from "node:stream"

import { PEER_ID_FILENAME } from "@canvas-js/core/constants"
import { getReasonPhrase } from "http-status-codes"

export const CANVAS_HOME = process.env.CANVAS_HOME ?? path.resolve("data")

// remove old files that have been deprecated
for (const name of fs.readdirSync(CANVAS_HOME)) {
	if (name === "daemon.sock" || name === PEER_ID_FILENAME) {
		fs.rmSync(path.resolve(CANVAS_HOME, name))
		continue
	}
}

export function rejectRequest(reqSocket: stream.Duplex, code: number) {
	const date = new Date()
	reqSocket.write(`HTTP/1.1 ${code} ${getReasonPhrase(code)}\r\n`)
	reqSocket.write(`Date: ${date.toUTCString()}\r\n`)
	reqSocket.write(`\r\n`)
	reqSocket.end()
}
