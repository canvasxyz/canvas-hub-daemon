import { EthereumChainImplementation } from "@canvas-js/chain-ethereum"
import { ChainImplementation } from "@canvas-js/interfaces"
import { ethers } from "ethers"

import { Daemon } from "./daemon.js"

const chains: ChainImplementation[] = []

const { ETH_CHAIN_ID, ETH_CHAIN_RPC, PORT } = process.env

if (ETH_CHAIN_ID && ETH_CHAIN_RPC) {
  const provider = new ethers.providers.JsonRpcProvider(ETH_CHAIN_RPC)
  chains.push(new EthereumChainImplementation(ETH_CHAIN_ID, provider))
  console.log(
    `[canvas-hub-daemon] Using Ethereum RPC for chain ID ${ETH_CHAIN_ID}: ${ETH_CHAIN_RPC}`
  )
} else {
  chains.push(new EthereumChainImplementation())
}

const daemon = new Daemon(chains, { verbose: true, unchecked: !chains.some((chain) => chain.hasProvider()) })

daemon.listen(PORT ? parseInt(PORT) : 8000)

let stopping = false
process.on("SIGINT", () => {
  if (stopping) {
    process.exit(1)
  } else {
    stopping = true
    process.stdout.write(
      `\nReceived SIGINT, attempting to exit gracefully. ^C again to force quit.\n`
    )

    daemon.close()
  }
})