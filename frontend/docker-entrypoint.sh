#!/bin/sh
set -e

# Default backend URL for docker-compose
export BACKEND_URL=${BACKEND_URL:-http://backend:3001}

# Substitute environment variables in nginx config
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Execute the main container command
exec "$@"
