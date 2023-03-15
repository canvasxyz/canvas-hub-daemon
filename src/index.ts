import http from "node:http"

import { EthereumChainImplementation } from "@canvas-js/chain-ethereum"
import { ChainImplementation } from "@canvas-js/interfaces"
import { ethers } from "ethers"

import { Daemon } from "./daemon.js"
import { StatusCodes } from "http-status-codes"

const chains: ChainImplementation[] = []

const { FLY_APP_NAME, ETH_CHAIN_ID, ETH_CHAIN_RPC, PORT, PROXY_PORT } = process.env

if (ETH_CHAIN_ID && ETH_CHAIN_RPC) {
  const provider = new ethers.providers.JsonRpcProvider(ETH_CHAIN_RPC)
  chains.push(new EthereumChainImplementation(ETH_CHAIN_ID, provider))
  console.log(
    `[canvas-hub-daemon] Using Ethereum RPC for chain ID ${ETH_CHAIN_ID}: ${ETH_CHAIN_RPC}`
  )
} else {
  chains.push(new EthereumChainImplementation())
}

const controller = new AbortController()

const daemon = new Daemon(chains, {
  verbose: true,
  unchecked: !chains.some((chain) => chain.hasProvider())
})

daemon.listen(PORT ? parseInt(PORT) : 8000)
controller.signal.addEventListener("abort", () => daemon.close())

// start the websocket proxy server
if (FLY_APP_NAME !== undefined && PROXY_PORT !== undefined) {
  const server = http.createServer((req, res) => res.writeHead(StatusCodes.BAD_REQUEST).end())
  server.on("upgrade", (req, reqSocket) => {
    const { host: _, "fly-forwarded-port": originPort, ...headers } = req.headers

    if (typeof originPort !== "string") {
      reqSocket.end()
      return
    }

    const proxyReq = http.request({ host: "localhost", port: parseInt(originPort), headers })

    proxyReq.end()
    proxyReq.on("upgrade", (proxyRes, resSocket, head) => {
      if (proxyRes.statusCode) {
        reqSocket.write("HTTP/1.1 101 Web Socket Protocol Handshake\r\n")
        proxyRes.rawHeaders.forEach(
          (rawHeader, i) => reqSocket.write(i % 2 === 0 ? `${rawHeader}: ` : `${rawHeader}\r\n`)
        )
        reqSocket.write("\r\n")
        reqSocket.pipe(resSocket).pipe(reqSocket)
      } else {
        resSocket.end()
        reqSocket.end()
      }
    })
  })

  server.listen(parseInt(PROXY_PORT), () => console.log(`[canvas-hub-daemon] Proxy server listening on http://localhost:${PROXY_PORT}`))

  controller.signal.addEventListener("abort", () => {
    server.close()
    server.closeAllConnections()
  })
}

let stopping = false
process.on("SIGINT", () => {
  if (stopping) {
    process.exit(1)
  } else {
    stopping = true
    process.stdout.write(
      `\nReceived SIGINT, attempting to exit gracefully. ^C again to force quit.\n`
    )

    controller.abort()
  }
})