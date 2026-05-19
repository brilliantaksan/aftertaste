# Private cobalt setup

This folder is a private `cobalt` API deployment scaffold for Aftertaste.

Assumptions:

- public cobalt API domain: `https://cobalt.brilliantaksan.com`
- local cobalt container bind: `127.0.0.1:9000`
- Aftertaste app domain: `https://aftertaste.brilliantaksan.com`
- local Aftertaste dev server: `http://127.0.0.1:4175`

## What is configured

- `docker-compose.yml` runs a private `cobalt` API container on `127.0.0.1:9000`
- `keys.json` contains a local API key for server-to-server Aftertaste calls
- auth is required by default via `API_AUTH_REQUIRED=1`
- Bearer-token auth is not enabled yet

## API key

Generate a UUID v4 value for the API key and keep it out of git. The same key should be written to:

- `ops/cobalt/keys.json`
- root `.env` as `AFTERTASTE_COBALT_API_KEY`

## Start cobalt

```bash
cd /Users/brilliantaksan/Developer/aftertaste/ops/cobalt
docker compose up -d
```

## Reverse proxy

Point `cobalt.brilliantaksan.com` at the same server, then proxy:

- `https://cobalt.brilliantaksan.com` -> `http://127.0.0.1:9000`

An nginx example:

```nginx
server {
  listen 80;
  server_name cobalt.brilliantaksan.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name cobalt.brilliantaksan.com;

  ssl_certificate /path/to/fullchain.pem;
  ssl_certificate_key /path/to/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Smoke test

Once the reverse proxy is live:

```bash
curl https://cobalt.brilliantaksan.com/
```

You should get instance metadata JSON back.

Then test an authenticated request:

```bash
curl https://cobalt.brilliantaksan.com/ \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Api-Key <your-api-key>' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Aftertaste integration

The root `.env` is already prepared with:

```bash
AFTERTASTE_COBALT_API_URL=https://cobalt.brilliantaksan.com
AFTERTASTE_COBALT_API_KEY=<your-api-key>
```

If you want to test locally before DNS/reverse-proxy is ready, temporarily switch to:

```bash
AFTERTASTE_COBALT_API_URL=http://127.0.0.1:9000
```

Then run Aftertaste as usual from `web/`.

## Optional later

- add `cookies.json` if a source needs authenticated public fetches
- add Cloudflare Turnstile plus `JWT_SECRET` if you want cobalt-issued Bearer tokens
- tighten the API key with IP allowlists once your server IP is stable
