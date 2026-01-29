#!/bin/sh
set -e

if [ -n "$BACKEND_URL" ]; then
    # Use provided backend URL - substitute in nginx config
    envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
else
    # No backend URL - serve static files only (external reverse proxy handles /api)
    cat > /etc/nginx/conf.d/default.conf << 'NGINX'
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 10M;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
fi

# Execute the main container command
exec "$@"
