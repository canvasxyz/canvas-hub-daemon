import { EthereumChainImplementation } from "@canvas-js/chain-ethereum"
import { ChainImplementation } from "@canvas-js/interfaces"
import { ethers } from "ethers"

import { Daemon } from "./daemon.js"
import { attachProxyServer } from "./proxy.js"

const chains: ChainImplementation[] = []

const { FLY_APP_NAME, ETH_CHAIN_ID, ETH_CHAIN_RPC, PORT, PROXY_PORT } = process.env

console.log(
	`[canvas-hub-daemon] Starting canvas-hub daemon, FLY_APP_NAME=${FLY_APP_NAME}, PORT=${PORT}, PROXY_PORT=${PROXY_PORT}`
)

if (ETH_CHAIN_ID && ETH_CHAIN_RPC) {
	const provider = new ethers.providers.JsonRpcProvider(ETH_CHAIN_RPC)
	chains.push(new EthereumChainImplementation(parseInt(ETH_CHAIN_ID), "localhost", provider))
	console.log(`[canvas-hub-daemon] Using Ethereum RPC for chain ID ${ETH_CHAIN_ID}: ${ETH_CHAIN_RPC}`)
} else {
	chains.push(new EthereumChainImplementation())
}

const controller = new AbortController()

const daemon = new Daemon(chains, PORT ? parseInt(PORT) : 8000, {
	unchecked: !chains.some((chain) => chain.hasProvider()),
})

controller.signal.addEventListener("abort", () => {
	console.log("[canvas-hub-daemon] Received abort signal, closing daemon")
	daemon.close()
})

// start the websocket proxy server
if (FLY_APP_NAME !== undefined && PROXY_PORT !== undefined) {
	attachProxyServer(parseInt(PROXY_PORT), (originPort) => daemon.portMap.has(originPort), controller.signal)
}

let stopping = false
process.on("SIGINT", () => {
	console.log("Process received SIGINT message")
	if (stopping) {
		process.exit(1)
	} else {
		stopping = true
		process.stdout.write(`\nReceived SIGINT, attempting to exit gracefully. ^C again to force quit.\n`)

		controller.abort()
	}
})
