#!/bin/sh
# PUID/PGID handling modeled on linuxserver.io images: remap the build-time
# `nodejs` user to the requested ids, fix /data ownership, then drop
# privileges. Skipped entirely when the container is started with --user.
set -e

if [ "$(id -u)" = "0" ]; then
  PUID=${PUID:-1001}
  PGID=${PGID:-1001}
  groupmod -o -g "$PGID" nodejs
  usermod  -o -u "$PUID" nodejs >/dev/null
  chown -R nodejs:nodejs /data
  echo "speedtest-monitor: running as uid=$PUID gid=$PGID"
  exec su-exec nodejs "$@"
fi

exec "$@"
