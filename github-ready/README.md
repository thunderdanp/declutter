# Declutter Assistant

A full-stack web application that helps users make mindful decisions about their belongings through personalized recommendations based on their personality profile, goals, and preferences.

[![Docker Build](https://github.com/thunderdanp/declutter-assistant/actions/workflows/docker-build.yml/badge.svg)](https://github.com/thunderdanp/declutter-assistant/actions/workflows/docker-build.yml)
[![Docker Hub](https://img.shields.io/docker/v/thunderdanp/declutter?label=docker%20hub)](https://hub.docker.com/r/thunderdanp/declutter)
[![Docker Image Size](https://img.shields.io/docker/image-size/thunderdanp/declutter/latest)](https://hub.docker.com/r/thunderdanp/declutter)

![Declutter Assistant](https://img.shields.io/badge/status-production%20ready-brightgreen)

## ✨ Features

- 🔐 **Secure Authentication** - User registration and login with JWT tokens
- 👤 **Personality Profiles** - Comprehensive questionnaire to understand your decluttering style
- 📸 **Image Upload** - Take photos of items you're evaluating
- 🤖 **Smart Recommendations** - AI-powered decisions: Keep, Storage, Accessible, Sell, Donate, or Discard
- 📊 **Dashboard** - Track your decluttering progress with statistics
- 📝 **Item History** - Review all evaluated items with filtering options
- 💾 **Database Storage** - All items and recommendations saved for future reference
- 🔒 **Single Port Architecture** - Secure deployment with only one exposed port
- 🌐 **Reverse Proxy Ready** - Works seamlessly behind Synology, Nginx, Traefik, etc.

## 🚀 Quick Start

### Using Pre-Built Docker Image (Recommended)

The fastest way to get started:

```bash
# Download docker-compose.yml and init.sql
curl -O https://raw.githubusercontent.com/thunderdanp/declutter-assistant/main/docker-compose-hub.yml
curl -O https://raw.githubusercontent.com/thunderdanp/declutter-assistant/main/init.sql

# Rename for convenience
mv docker-compose-hub.yml docker-compose.yml

# Start the application
docker-compose up -d

# Access at http://localhost:3000
```

**📖 See [DEPLOY-PREBUILT.md](DEPLOY-PREBUILT.md) for detailed deployment instructions**

### Building From Source

```bash
# Clone the repository
git clone https://github.com/thunderdanp/declutter-assistant.git
cd declutter-assistant

# Start the application
docker-compose up --build -d

# Access at http://localhost:3000
```

**📖 See [QUICKSTART.md](QUICKSTART.md) for detailed setup instructions**

## 📋 Requirements

- Docker and Docker Compose
- Port 3000 available
- 2GB free disk space

## 🎯 How It Works

1. **Create an Account** - Sign up and log in
2. **Set Up Your Profile** - Answer questions about your decluttering goals and style
3. **Evaluate Items** - Enter item details, upload photos, answer evaluation questions
4. **Get Recommendations** - Receive personalized advice based on your profile
5. **Track Progress** - View statistics and review your decisions

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
- **[DEPLOY-PREBUILT.md](DEPLOY-PREBUILT.md)** - Deploy using pre-built Docker image
- **[REVERSE-PROXY-SETUP.md](REVERSE-PROXY-SETUP.md)** - Synology and reverse proxy configuration
- **[DOCKER-BUILD.md](DOCKER-BUILD.md)** - Building and publishing Docker images
- **[GITHUB-SETUP.md](GITHUB-SETUP.md)** - Setting up automated builds

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  Host Machine                               │
│                                             │
│  Port 3000 ──────┐                         │
│                  │                          │
│  ┌───────────────┼──────────────────────┐  │
│  │ Docker        │                      │  │
│  │               ▼                      │  │
│  │  ┌─────────────────────────┐        │  │
│  │  │ App Container           │        │  │
│  │  │ - Nginx (Frontend)      │        │  │
│  │  │ - Node.js (Backend)     │        │  │
│  │  └────────┬────────────────┘        │  │
│  │           │                          │  │
│  │           ▼                          │  │
│  │  ┌─────────────────────────┐        │  │
│  │  │ PostgreSQL Database     │        │  │
│  │  └─────────────────────────┘        │  │
│  │                                      │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

**Frontend:**
- React 18
- React Router
- Custom CSS with design system
- Responsive layout

**Backend:**
- Node.js + Express
- PostgreSQL database
- JWT authentication
- Multer for file uploads

**Infrastructure:**
- Docker & Docker Compose
- Nginx for serving frontend
- Multi-stage builds
- GitHub Actions CI/CD

## 🔧 Configuration

### Environment Variables

Create a `docker-compose.override.yml` to customize:

```yaml
version: '3.8'

services:
  app:
    environment:
      JWT_SECRET: "your-very-long-random-secret"
    ports:
      - "8080:80"  # Change port
```

### Database Backup

```bash
# Backup
docker exec declutter_db pg_dump -U declutter_user declutter_db > backup.sql

# Restore
cat backup.sql | docker exec -i declutter_db psql -U declutter_user -d declutter_db
```

## 🔒 Security

**Important for Production:**
1. ✅ Change `JWT_SECRET` to a strong random value
2. ✅ Use a secure database password  
3. ✅ Deploy behind HTTPS (reverse proxy)
4. ✅ Enable firewall rules
5. ✅ Regular database backups

**See [REVERSE-PROXY-SETUP.md](REVERSE-PROXY-SETUP.md) for production deployment guide**

## 🐳 Docker Hub

Pre-built images available at:
**[thunderdanp/declutter](https://hub.docker.com/r/thunderdanp/declutter)**

**Supported Platforms:**
- `linux/amd64` - Intel/AMD 64-bit
- `linux/arm64` - ARM 64-bit (Apple Silicon, Raspberry Pi)

**Tags:**
- `latest` - Latest stable release
- `1.0.0`, `1.1.0` - Specific versions
- `main-sha-xxxxxx` - Development builds

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern web technologies
- Designed for ease of use and deployment
- Community-driven development

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/thunderdanp/declutter-assistant/issues)
- **Documentation**: See docs folder
- **Discussions**: [GitHub Discussions](https://github.com/thunderdanp/declutter-assistant/discussions)

## 🗺️ Roadmap

- [ ] Mobile app (React Native)
- [ ] Export data to CSV/PDF
- [ ] Room-by-room organization
- [ ] Integration with selling platforms
- [ ] Multi-user households
- [ ] Progress photos and tracking

---

**Made with ❤️ for organized homes**
