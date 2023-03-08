# canvas-hub-daemon proxy

When we deploy canvas-hub-daemon to production, this application will listen on an external-facing port for all HTTP requests. It looks for a `Fly-Forwarded-Port` header in the request. It then forwards the request to `localhost:<port>`.
