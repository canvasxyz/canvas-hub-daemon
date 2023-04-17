import http from "node:http"

import { StatusCodes } from "http-status-codes"
import { rejectRequest } from "./utils.js"

export function attachProxyServer(
	proxyPort: number,
	connectionGater: (originPort: number) => boolean,
	signal: AbortSignal
) {
	const server = http.createServer((req, res) => res.writeHead(StatusCodes.BAD_REQUEST).end())

	server.on("upgrade", (req, reqSocket) => {
		const { host: _, "fly-forwarded-port": originPort, ...headers } = req.headers

		if (typeof originPort !== "string") {
			rejectRequest(reqSocket, StatusCodes.BAD_REQUEST)
			return
		}

		if (!connectionGater(parseInt(originPort))) {
			rejectRequest(reqSocket, StatusCodes.NOT_FOUND)
			return
		}

		const proxyReq = http.request({
			host: "localhost",
			port: parseInt(originPort),
			headers,
		})

		proxyReq.end()
		proxyReq.on("upgrade", (proxyRes, resSocket, head) => {
			console.log(
				`[canvas-hub-daemon] proxyReq upgrade message on port ${originPort}, statusCode=${proxyRes.statusCode}`
			)
			if (proxyRes.statusCode === undefined) {
				resSocket.end()
				rejectRequest(reqSocket, StatusCodes.BAD_GATEWAY)
				return
			}

			reqSocket.write("HTTP/1.1 101 Web Socket Protocol Handshake\r\n")
			proxyRes.rawHeaders.forEach((rawHeader, i) =>
				reqSocket.write(i % 2 === 0 ? `${rawHeader}: ` : `${rawHeader}\r\n`)
			)
			reqSocket.write("\r\n")
			reqSocket.pipe(resSocket).pipe(reqSocket)
		})

		proxyReq.on("error", (err) => {
			console.log(`[canvas-hub-daemon] error thrown by proxyReq`, err)
			reqSocket.end()
		})
	})

	server.listen(proxyPort, () =>
		console.log(`[canvas-hub-daemon] Proxy server listening on http://localhost:${proxyPort}`)
	)

	signal.addEventListener("abort", () => {
		console.log("[canvas-hub-daemon] Received abort signal, closing proxy server")
		server.close()
		server.closeAllConnections()
	})
}
