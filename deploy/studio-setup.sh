#!/bin/sh
# One-time setup of the social studio on the game server (run as root):
#   sh deploy/studio-setup.sh
# 1. Installs the tools the studio needs but the game doesn't (Playwright + Chromium, ffmpeg,
#    the optional Anthropic SDK) into /opt/broadroads-studio-tools.
# 2. Creates /etc/broadroads/studio.env for the studio's keys (fill it in afterwards).
# 3. Installs and starts broadroads-studio.service.
# 4. Adds social.broadroads.com to Caddy (needs a DNS A record pointing at this server).
set -eu
APP=${APP_DIR:-/opt/broadroads}
TOOLS=/opt/broadroads-studio-tools
DOMAIN=${STUDIO_DOMAIN:-social.broadroads.com}

mkdir -p "$TOOLS"
cd "$TOOLS"
[ -f package.json ] || echo '{ "name": "broadroads-studio-tools", "private": true }' > package.json
PW=$(node -p "require('$APP/package.json').devDependencies.playwright")
npm install --no-audit --no-fund --loglevel=error "playwright@$PW" ffmpeg-static@5 @anthropic-ai/sdk
PLAYWRIGHT_BROWSERS_PATH="$TOOLS/browsers" npx playwright install chromium
chown -R broadroads:broadroads "$TOOLS"

mkdir -p /etc/broadroads
if [ ! -f /etc/broadroads/studio.env ]; then
  cat > /etc/broadroads/studio.env <<EOF
# Social studio secrets (read by broadroads-studio.service). Restart the service after editing.
# Login token for https://$DOMAIN (at least 16 characters). Leave empty to use ADMIN_TOKEN.
STUDIO_TOKEN=
ELEVENLABS_API_KEY=
# Google Cloud OAuth client (Web application) with YouTube Data API v3 enabled and the
# redirect URI https://$DOMAIN/oauth/youtube/callback
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
# Optional: Claude writes the commentary and titles.
ANTHROPIC_API_KEY=
STUDIO_PUBLIC_URL=https://$DOMAIN
EOF
  chmod 600 /etc/broadroads/studio.env
  echo "Fill in /etc/broadroads/studio.env, then: systemctl restart broadroads-studio"
fi

cp "$APP/deploy/broadroads-studio.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now broadroads-studio

if ! grep -q "$DOMAIN" /etc/caddy/Caddyfile; then
  cat >> /etc/caddy/Caddyfile <<EOF

# Social studio (admins only; the app does its own login).
$DOMAIN {
	encode gzip zstd
	reverse_proxy 127.0.0.1:8090
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
}
EOF
  systemctl reload caddy
fi
echo "Studio installed. Open https://$DOMAIN once DNS for $DOMAIN points here."
