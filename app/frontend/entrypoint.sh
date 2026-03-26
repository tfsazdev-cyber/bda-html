#!/bin/sh
# Inject BDA_API_URL into HTML files at container startup
# Usage: BDA_API_URL=http://my-backend:3000 (set as env var)

API_URL="${BDA_API_URL:-}"

if [ -n "$API_URL" ]; then
  echo "[entrypoint] Injecting BDA_API_URL: $API_URL"
  for f in /usr/share/nginx/html/index.html /usr/share/nginx/html/dashboard.html; do
    sed -i "s|window.BDA_API_URL || ''|'${API_URL}'|g" "$f"
  done
else
  echo "[entrypoint] BDA_API_URL not set — API calls will use empty base URL (same origin)"
fi

exec nginx -g 'daemon off;'
