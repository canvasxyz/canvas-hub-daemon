# canvas-hub-daemon

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
