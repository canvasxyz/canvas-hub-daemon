# canvas-hub-daemon

TODO: Explain how proxying works

## Deployment on fly.io

`canvas-hub-daemon` is currently configured to use fly.io as a hosting service. To deploy your own instance, firstly run the steps in "Initial setup" if a fly app does not exist, then the steps in "Deployment".

### Initial setup

If a fly.io app for `canvas-hub-daemon` does not already exist, run the following command:

```
fly launch --copy-config --no-deploy
```

When prompted, do not set up a PostgreSQL instance. Then run the following command to create a new volume - this will persistently store the app data, which will be mounted by the `canvas-hub-daemon` app when it is deployed:

```
fly volumes create data
```

Then run the following commands to allocate IP addresses for the `canvas-hub-daemon`:

```
fly ips allocate-v4
fly ips allocate-v6
```

### Deployment

Once the initial setup is complete (or if you are updating an existing app), build the latest version of `canvas-hub-daemon` and deploy it to fly.io with the following commands:

```
npm run build
fly deploy
```

## How to run canvas-hub-daemon locally

To run `canvas-hub-daemon` locally, run the following commands in the repository directory:

```
mkdir data  # Create a directory to store app data
npm install  # Install dependencies
npm run build  # Build the app source
npm run start  # Run the built app
```

This will start a daemon server running on `http://127.0.0.1:8000` with the "proxy server" feature disabled. To change the port that the daemon is running on, set the `PORT` environment variable.

See the [canvas-hub](https://github.com/canvasxyz/canvas-hub) documentation for running `canvas-hub` locally alongside the daemon.

## Checking blocks on Ethereum

By default, the daemon runs in *unchecked* mode, meaning that the block hashes sent in action and session messages will not be checked against the blockchain. To check blocks, set the `ETH_CHAIN_ID` environment variable to the id of an Ethereum chain (e.g. 1 for mainnet, 5 for göerli) and set the `ETH_CHAIN_RPC` environment variable to an RPC endpoint for the corresponding chain (these can be generated by signing up for a service like Infura or running your own Ethereum node).

## Note: regarding private networking on fly.io

If you can't successfully `ping6 canvas-hub-daemon.internal` after joining the Wireguard VPN it's probably because your ISP doesn't support IPv6 and that's confusing macos into thinking it can't resolve v6 addresses even though it really can. You can `dig canvas-hub-daemon.internal` to resolve the instance's internal address and use that instead. The internal address changes between deployments.

```
% dig canvas-hub-daemon.internal aaaa +noall +answer

; <<>> DiG 9.10.6 <<>> canvas-hub-daemon.internal aaaa +noall +answer
;; global options: +cmd
canvas-hub-daemon.internal. 5	IN	AAAA	fdaa:0:ce3a:a7b:7d17:3:911e:2
%
% ping6 fdaa:0:ce3a:a7b:7d17:3:911e:2
PING6(56=40+8+8 bytes) fdaa:0:ce3a:a7b:8cfe:0:a:502 --> fdaa:0:ce3a:a7b:7d17:3:911e:2
16 bytes from fdaa:0:ce3a:a7b:7d17:3:911e:2, icmp_seq=0 hlim=62 time=86.032 ms
16 bytes from fdaa:0:ce3a:a7b:7d17:3:911e:2, icmp_seq=1 hlim=62 time=84.655 ms
16 bytes from fdaa:0:ce3a:a7b:7d17:3:911e:2, icmp_seq=2 hlim=62 time=81.929 ms
%
% curl 'http://[fdaa:0:ce3a:a7b:7d17:3:911e:2]:8000/app' -s | jq
{}
```
