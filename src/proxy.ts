import http from "node:http"

import { StatusCodes } from "http-status-codes"

export function attachProxyServer(proxyPort: number, connectionGater: (originPort: number) => boolean, signal: AbortSignal) {
  const server = http.createServer((req, res) =>
    res.writeHead(StatusCodes.BAD_REQUEST).end()
  )

  server.on("upgrade", (req, reqSocket) => {
    const {
      host: _,
      "fly-forwarded-port": originPort,
      ...headers
    } = req.headers

    if (typeof originPort !== "string") {
      reqSocket.end()
      return
    }

    if (!connectionGater(parseInt(originPort))) {
      reqSocket.end()
      return
    }

    const proxyReq = http.request({
      host: "localhost",
      port: parseInt(originPort),
      headers,
    })

    proxyReq.end()
    proxyReq.on("upgrade", (proxyRes, resSocket, head) => {
      console.log(`[canvas-hub-daemon] proxyReq upgrade message on port ${originPort}, statusCode=${proxyRes.statusCode}`)
      if (proxyRes.statusCode) {
        reqSocket.write("HTTP/1.1 101 Web Socket Protocol Handshake\r\n")
        proxyRes.rawHeaders.forEach((rawHeader, i) =>
          reqSocket.write(i % 2 === 0 ? `${rawHeader}: ` : `${rawHeader}\r\n`)
        )
        reqSocket.write("\r\n")
        reqSocket.pipe(resSocket).pipe(reqSocket)
      } else {
        resSocket.end()
        reqSocket.end()
      }
    })

    proxyReq.on("error", (e) => {
      console.log(`[canvas-hub-daemon] error thrown by proxyReq:`)
      console.log(e)
      reqSocket.end()
    })
  })

  server.listen(proxyPort, () =>
    console.log(
      `[canvas-hub-daemon] Proxy server listening on http://localhost:${proxyPort}`
    )
  )

  signal.addEventListener("abort", () => {
    console.log("[canvas-hub-daemon] Received abort signal, closing proxy server")
    server.close()
    server.closeAllConnections()
  })
}
