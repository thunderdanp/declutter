FROM node:18-alpine AS backend-build

WORKDIR /app/backend

# Copy backend files and install all deps (need typescript for build)
COPY backend/package*.json ./
RUN npm install

COPY backend/*.ts ./
COPY backend/tsconfig.json ./

# Compile TypeScript to dist/
RUN npx tsc

# Reinstall production-only deps
RUN rm -rf node_modules && npm install --production

# Frontend build stage
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend files
COPY frontend/package*.json ./
RUN npm install

COPY frontend/public ./public
COPY frontend/src ./src

# Build the React app
RUN npm run build

# Final stage - combines backend and serves frontend
FROM node:18-alpine

# Install nginx
RUN apk add --no-cache nginx

WORKDIR /app

# Copy backend build artifacts
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/package.json ./backend/
COPY backend/init.sql ./backend/
COPY backend/migrations ./backend/migrations

# Copy frontend build from frontend-build stage
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/http.d/default.conf

# Create uploads directory in backend location
RUN mkdir -p /app/backend/uploads

# Create nginx directories and set permissions
RUN mkdir -p /var/lib/nginx/tmp /var/log/nginx /run/nginx && \
    chown -R nginx:nginx /var/lib/nginx /var/log/nginx /run/nginx /app/backend/uploads

# Expose port 80
EXPOSE 80

# Copy startup script
COPY docker-build/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
