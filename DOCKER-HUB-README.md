# Declutter Assistant

A full-stack web application that helps users make mindful decisions about their belongings through personalized recommendations.

## Quick Start

```bash
# Download docker-compose.yml and init.sql
# Then run:
docker-compose up -d

# Access at http://localhost:3000
```

## Features

- 🔐 User authentication with JWT
- 👤 Personality profile system
- 📸 Image upload support
- 🤖 Smart AI-powered recommendations (Keep, Storage, Sell, Donate, Discard)
- 📊 Progress tracking dashboard
- 💾 PostgreSQL database
- 🔒 Secure, single-port architecture

## Supported Platforms

- `linux/amd64` - Intel/AMD 64-bit
- `linux/arm64` - ARM 64-bit (Apple Silicon, Raspberry Pi 4+)

## Tags

- `latest` - Latest stable release
- `1.0.0`, `1.1.0`, etc. - Specific versions
- `main-sha-xxxxxx` - Development builds

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret key for JWT tokens | Required |
| `PORT` | Backend port | 3001 |
| `NODE_ENV` | Environment | production |

## Volumes

- `/app/uploads` - User uploaded images (mount to persist data)

## Ports

- `80` - HTTP port (map to host port, e.g., `3000:80`)

## Docker Compose Example

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: declutter_db
      POSTGRES_USER: declutter_user
      POSTGRES_PASSWORD: your-password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

  app:
    image: thunderdanp/declutter:latest
    ports:
      - "3000:80"
    environment:
      DATABASE_URL: postgresql://declutter_user:your-password@postgres:5432/declutter_db
      JWT_SECRET: your-secret-key
      PORT: 3001
    depends_on:
      - postgres
    volumes:
      - ./uploads:/app/uploads

volumes:
  postgres_data:
```

## Documentation

- [GitHub Repository](https://github.com/thunderdanp/declutter-assistant)
- [Quick Start Guide](https://github.com/thunderdanp/declutter-assistant/blob/main/QUICKSTART.md)
- [Reverse Proxy Setup](https://github.com/thunderdanp/declutter-assistant/blob/main/REVERSE-PROXY-SETUP.md)
- [Deployment Guide](https://github.com/thunderdanp/declutter-assistant/blob/main/DEPLOY-PREBUILT.md)

## Security

⚠️ **Important**: Before deploying to production:
1. Change `JWT_SECRET` to a strong random value
2. Use a secure database password
3. Deploy behind HTTPS (reverse proxy recommended)
4. Enable firewall rules

## Updates

Pull the latest version:
```bash
docker-compose pull
docker-compose up -d
```

## Support

For issues or questions:
- [GitHub Issues](https://github.com/thunderdanp/declutter-assistant/issues)
- [Documentation](https://github.com/thunderdanp/declutter-assistant)

## License

See repository for license information.
