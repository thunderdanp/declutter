# Declutter Assistant - Complete Package

🏠 Smart home organization and decluttering assistant with AI-powered recommendations.

## 📦 What's in This Package

This is the **complete source and deployment package** for Declutter Assistant. Choose your path based on what you want to do:

### 🎯 Quick Navigation

- **I want to BUILD the Docker image** → See [Building](#building-the-docker-image)
- **I want to DEPLOY for users** → See [Deployment](#deployment-options)
- **I want to UPLOAD to GitHub** → See [GitHub Setup](#github-setup)
- **I want to use REVERSE PROXY** → See [Reverse Proxy](#reverse-proxy-setup)

---

## 🔨 Building the Docker Image

**⚠️ IMPORTANT:** You must build and push the Docker image to Docker Hub BEFORE users can deploy with the zero-setup method.

### Choose Your Platform:

#### macOS Users (Intel or Apple Silicon)
```bash
./build-and-push-macos.sh
```
📖 Full guide: [MACOS-BUILD-GUIDE.md](MACOS-BUILD-GUIDE.md)

#### Windows Users
```powershell
.\build-and-push.ps1
```
📖 Full guide: [WINDOWS-BUILD-GUIDE.md](WINDOWS-BUILD-GUIDE.md)

#### Linux Users
```bash
./build-and-push.sh
```
📖 Full guide: [BUILD-IMAGE-FIRST.md](BUILD-IMAGE-FIRST.md)

### Or Use GitHub Actions (Automated)

1. Upload this package to GitHub
2. Configure Docker Hub secrets
3. GitHub automatically builds and pushes

📖 Full guide: [GITHUB-SETUP.md](GITHUB-SETUP.md)

---

## 🚀 Deployment Options

### Option 1: Zero-Setup Deployment (Recommended for Users)

**Requirements:** Docker image must exist on Docker Hub first!

Users download `declutter-zero-setup.zip` (separate package) and run:
```bash
docker-compose up -d
```

- ✅ No source code needed
- ✅ No build time
- ✅ Instant deployment
- ✅ Pre-built image from Docker Hub

📖 Guide: [DEPLOY-PREBUILT.md](DEPLOY-PREBUILT.md)

### Option 2: Build from Source

Users have full source code and build locally:
```bash
docker-compose up --build -d
```

- ✅ Full control over source
- ✅ Can modify application
- ⏱️ Takes 3-5 minutes to build

📖 Guide: [QUICKSTART.md](QUICKSTART.md)

---

## 📁 Package Contents

```
declutter-assistant/
├── 📖 Documentation
│   ├── README.md (this file)
│   ├── MACOS-BUILD-GUIDE.md         ← macOS build instructions
│   ├── WINDOWS-BUILD-GUIDE.md       ← Windows build instructions
│   ├── BUILD-IMAGE-FIRST.md         ← Linux/general build guide
│   ├── QUICKSTART.md                ← Quick setup guide
│   ├── DEPLOY-PREBUILT.md           ← Zero-setup deployment
│   ├── REVERSE-PROXY-SETUP.md       ← Synology/proxy config
│   ├── GITHUB-SETUP.md              ← GitHub Actions setup
│   └── DOCKER-BUILD.md              ← Docker image details
│
├── 🔨 Build Scripts
│   ├── build-and-push-macos.sh      ← macOS build script
│   ├── build-and-push.ps1           ← Windows PowerShell script
│   ├── build-and-push.sh            ← Linux bash script
│   └── validate-structure.sh        ← Pre-build validator
│
├── 🐳 Docker Configuration
│   ├── docker-compose.yml           ← Build from source
│   ├── docker-compose-simple.yml    ← Pre-built image
│   ├── docker-compose-hub.yml       ← Pre-built (alt)
│   └── docker-compose-minimal.yml   ← Minimal config
│
├── 🏗️ Source Code
│   ├── backend/                     ← Node.js/Express API
│   ├── frontend/                    ← React application
│   ├── docker-build/                ← Combined image build
│   └── init.sql                     ← Database schema
│
├── ⚙️ Configuration
│   ├── .env.example                 ← Environment variables
│   ├── .gitignore                   ← Git ignore rules
│   └── .gitattributes               ← Git attributes
│
└── 🤖 GitHub Actions
    └── .github/workflows/
        └── docker-build.yml         ← Auto-build on push
```

---

## 🎯 Common Workflows

### Workflow 1: First-Time Setup (You're the Developer)

1. **Build the image:**
   ```bash
   ./build-and-push-macos.sh  # or .ps1 for Windows
   ```

2. **Verify on Docker Hub:**
   Visit https://hub.docker.com/r/thunderdanp/declutter

3. **Share with users:**
   Give them `declutter-zero-setup.zip` (created separately)

### Workflow 2: Development & Testing

1. **Make code changes** in `backend/` or `frontend/`

2. **Test locally:**
   ```bash
   docker-compose up --build
   ```

3. **Push updates:**
   ```bash
   ./build-and-push-macos.sh
   ```

### Workflow 3: GitHub-Based Deployment

1. **Upload to GitHub:**
   See [GITHUB-SETUP.md](GITHUB-SETUP.md)

2. **Configure secrets:**
   Add DOCKERHUB_USERNAME and DOCKERHUB_TOKEN

3. **Automatic builds:**
   Every push triggers new Docker image

---

## 🌐 Reverse Proxy Setup

Deploy behind Synology, Nginx, Traefik, or other reverse proxies:

1. Start application: `docker-compose up -d`
2. Configure reverse proxy to `localhost:3000`
3. Add SSL certificate

📖 Complete guide: [REVERSE-PROXY-SETUP.md](REVERSE-PROXY-SETUP.md)

---

## 🔧 Configuration

### Environment Variables

Create `.env` file or edit `docker-compose.yml`:

```env
# Database
POSTGRES_PASSWORD=your-secure-password

# JWT Secret (IMPORTANT: Change in production!)
JWT_SECRET=your-very-long-random-secret-key

# Anthropic API Key (Required for AI image analysis)
# Get your key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=your-anthropic-api-key

# Port
PORT=3000
```

### Change Port

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Change 3000 to 8080
```

---

## 📊 Architecture

```
┌─────────────────────────────────────┐
│  Host Machine                       │
│                                     │
│  Port 3000 ──┐                     │
│              │                      │
│  ┌───────────┼─────────────────┐   │
│  │ Docker    │                 │   │
│  │           ▼                 │   │
│  │  ┌─────────────────┐        │   │
│  │  │ App Container   │        │   │
│  │  │ - Nginx         │        │   │
│  │  │ - Node.js       │        │   │
│  │  └────────┬────────┘        │   │
│  │           │                 │   │
│  │           ▼                 │   │
│  │  ┌─────────────────┐        │   │
│  │  │ PostgreSQL      │        │   │
│  │  └─────────────────┘        │   │
│  │                             │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Security:**
- Only port 3000 exposed to host
- Backend and database internal only
- Proper network isolation

---

## ✨ Features

### User Features
- 🔐 **Secure Authentication** - JWT-based user management with password reset
- 👤 **Personality Profiles** - Customized recommendations based on your decluttering style
- 📸 **Image Upload** - Photo documentation with AI-powered analysis
- 🤖 **Smart Recommendations** - AI-powered decisions (keep, sell, donate, discard)
- ✅ **Decision Recording** - Track what you actually did with each item
- 👨‍👩‍👧‍👦 **Household Members** - Attribute items to family members
- 📊 **Progress Dashboard** - Track your decluttering journey
- 🌙 **Dark Mode** - Light and dark theme support

### Admin Features
- 👥 **User Management** - Approve, manage, and monitor users
- 📧 **Email Templates** - Customizable email communications
- 📢 **Announcements** - Send updates to all users
- 🏷️ **Category Management** - Create and organize item categories
- ⚙️ **Recommendation Tuning** - Adjust AI recommendation weights and strategies
- 🧪 **A/B Testing** - Test different recommendation strategies
- 📈 **Analytics Dashboard** - Track item trends, user activity, and conversion rates
- 💰 **API Usage Monitoring** - Monitor AI API costs

### Technical Features
- 💾 **Data Persistence** - PostgreSQL database with full backups
- 🌐 **Reverse Proxy Ready** - Production deployment support
- 🔒 **Single Port** - Simplified firewall rules
- 🐳 **Docker Deployment** - Easy containerized deployment

---

## 🛠️ Tech Stack

**Frontend:**
- React 18 with hooks
- React Router v6
- Context API for state management
- Custom CSS with CSS variables
- Responsive design

**Backend:**
- Node.js + Express.js
- PostgreSQL with node-postgres
- JWT Authentication
- Multer (file uploads)
- Anthropic Claude API (AI features)
- Nodemailer (email)

**Infrastructure:**
- Docker & Docker Compose
- Nginx reverse proxy
- Multi-stage builds
- GitHub Actions CI/CD

## 📖 Developer Documentation

| Document | Description |
|----------|-------------|
| [docs/API.md](docs/API.md) | Complete REST API documentation |
| [backend/init.sql](backend/init.sql) | Database schema with comments |
| [backend/server.js](backend/server.js) | Backend API server (documented) |
| [frontend/src/](frontend/src/) | React components and utilities |

---

## 🔒 Security Notes

**Before production deployment:**

1. ✅ Change `JWT_SECRET` to a strong random value
2. ✅ Change database password
3. ✅ Use HTTPS (via reverse proxy)
4. ✅ Enable firewall rules
5. ✅ Regular backups

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file

---

## 🆘 Troubleshooting

### Docker Not Running
- macOS: Open Docker Desktop from Applications
- Windows: Open Docker Desktop
- Linux: `sudo systemctl start docker`

### Can't Login to Docker Hub
```bash
docker login
docker info | grep Username  # Verify login
```

### Build Fails
```bash
docker system prune -a  # Clean up
./build-and-push-macos.sh  # Try again
```

### Port Already in Use
```bash
# Find what's using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Change port in docker-compose.yml
```

---

## 📚 Documentation Index

| Guide | Description | Platform |
|-------|-------------|----------|
| [MACOS-BUILD-GUIDE.md](MACOS-BUILD-GUIDE.md) | Complete macOS build instructions | macOS |
| [WINDOWS-BUILD-GUIDE.md](WINDOWS-BUILD-GUIDE.md) | Complete Windows build instructions | Windows |
| [BUILD-IMAGE-FIRST.md](BUILD-IMAGE-FIRST.md) | Linux/general build guide | Linux/All |
| [QUICKSTART.md](QUICKSTART.md) | Quick 5-minute setup | All |
| [DEPLOY-PREBUILT.md](DEPLOY-PREBUILT.md) | Zero-setup deployment | All |
| [REVERSE-PROXY-SETUP.md](REVERSE-PROXY-SETUP.md) | Synology & reverse proxy | All |
| [GITHUB-SETUP.md](GITHUB-SETUP.md) | GitHub Actions automation | All |
| [DOCKER-BUILD.md](DOCKER-BUILD.md) | Docker image details | All |

---

## 🎉 Quick Start Commands

```bash
# Build the image (macOS)
./build-and-push-macos.sh

# Build the image (Windows)
.\build-and-push.ps1

# Deploy locally
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Update
docker-compose pull && docker-compose up -d
```

---

## 📧 Support

- **Issues**: Create issue on GitHub
- **Documentation**: See guides in this package
- **Updates**: Check Docker Hub for new versions

---

**Made with ❤️ for organized homes**
