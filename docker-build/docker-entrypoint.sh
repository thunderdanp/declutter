#!/bin/sh
set -e

echo "Starting Declutter Assistant..."

# Start nginx in background
echo "Starting Nginx..."
nginx -g 'daemon off;' &

# Start Node.js backend
echo "Starting Backend API..."
cd /app/backend
exec node dist/server.js
