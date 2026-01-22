# Docker Build Guide

## Overview

This guide explains how to build the Declutter Assistant Docker image with the Claude AI vision integration.

---

## Prerequisites

1. **Docker installed and running**
   - Linux: `sudo apt install docker.io` or `sudo yum install docker`
   - macOS: Install Docker Desktop
   - Windows: Install Docker Desktop

2. **Docker Hub account** (if you want to push the image)
   - Sign up at https://hub.docker.com/

3. **Sufficient disk space**
   - At least 2GB free for the build

---

## Quick Build

### Linux / macOS / WSL

```bash
# Make sure you're in the project root directory
cd /path/to/declutter

# Run the build script
./build-and-push.sh
```

### macOS with Apple Silicon

```bash
# Use the macOS-specific script for multi-platform builds
./build-and-push-macos.sh
```

### Windows PowerShell

```powershell
# Run the PowerShell build script
.\build-and-push.ps1
```

---

## Manual Build Process

If you prefer to build manually:

```bash
# Navigate to the docker-build directory
cd docker-build

# Build the image
docker build -t thunderdanp/declutter:latest .

# Tag with version
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0

# (Optional) Push to Docker Hub
docker login
docker push thunderdanp/declutter:latest
docker push thunderdanp/declutter:1.0.0
```

---

## What Gets Built

The Docker image includes:

### Backend
- Node.js 18 (Alpine)
- Express API server
- **Anthropic SDK for Claude AI vision**
- PostgreSQL client libraries
- JWT authentication
- Multer for file uploads

### Frontend
- React 18 application (production build)
- **AI-powered image analysis UI**
- Optimized static assets
- Nginx web server

### Combined Image
- Multi-stage build for minimal size
- Single port exposed (80)
- Nginx reverse proxy
- Backend and frontend in one container

---

## Build Architecture

```
┌─────────────────────────────────────────┐
│  Stage 1: Backend Build                │
│  - Install Node.js dependencies         │
│  - Copy backend source                  │
│  - Include Anthropic SDK                │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Stage 2: Frontend Build                │
│  - Install React dependencies           │
│  - Build production React app           │
│  - Include AI analysis components       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Stage 3: Final Image                   │
│  - Alpine Linux base                    │
│  - Nginx + Node.js                      │
│  - Copy built backend                   │
│  - Copy built frontend                  │
│  - Configure nginx reverse proxy        │
└─────────────────────────────────────────┘
```

---

## Image Details

**Image Name**: `thunderdanp/declutter:latest`
**Base Image**: `node:18-alpine`
**Final Size**: ~300-400MB
**Architecture**: linux/amd64, linux/arm64 (multi-platform)

### Ports
- **80**: HTTP (Nginx serving frontend + API proxy)

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `ANTHROPIC_API_KEY`: Claude AI API key (new!)
- `PORT`: Backend port (default: 3001)

---

## Testing the Built Image

### 1. Test Locally

```bash
# Run with docker-compose
docker-compose up -d

# Or run standalone (need PostgreSQL separately)
docker run -p 3000:80 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e JWT_SECRET="your-secret" \
  -e ANTHROPIC_API_KEY="your-api-key" \
  thunderdanp/declutter:latest
```

### 2. Verify Health

```bash
# Check if container is running
docker ps

# Test health endpoint
curl http://localhost:3000/api/health

# View logs
docker logs declutter_app
```

### 3. Test AI Integration

1. Open http://localhost:3000
2. Register/Login
3. Go to "Evaluate Item"
4. Upload a photo
5. Verify form fields auto-populate

---

## Troubleshooting

### Build Fails with "COPY failed"

**Issue**: Files not found during COPY steps

**Solution**: Make sure docker-build directory has updated files
```bash
# Sync files (already done if using git)
cp backend/package.json docker-build/backend/
cp backend/server.js docker-build/backend/
cp -r frontend/src/* docker-build/frontend/src/
```

### Build Fails with "npm install" errors

**Issue**: Network or dependency problems

**Solution**:
```bash
# Clear Docker build cache
docker builder prune

# Retry build
docker build --no-cache -t thunderdanp/declutter:latest .
```

### Image is Too Large

**Issue**: Image size exceeds expectations

**Check**:
```bash
# View image size
docker images thunderdanp/declutter

# View layer sizes
docker history thunderdanp/declutter:latest
```

**Solution**: The multi-stage build should keep it under 500MB. If larger, check for unnecessary files being copied.

### "Permission Denied" on Scripts

**Issue**: Cannot execute build scripts

**Solution**:
```bash
chmod +x build-and-push.sh
chmod +x build-and-push-macos.sh
```

---

## CI/CD Integration

### GitHub Actions

The repository includes GitHub Actions workflow at `.github/workflows/docker-build.yml`:

1. Push code to GitHub
2. Workflow automatically builds image
3. Pushes to Docker Hub on main branch

**Setup**:
1. Add secrets to GitHub repository:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
2. Push to main branch
3. Image builds automatically

---

## Build Optimization Tips

### Faster Builds

1. **Use BuildKit**:
   ```bash
   DOCKER_BUILDKIT=1 docker build -t thunderdanp/declutter .
   ```

2. **Parallel Builds**:
   Multi-stage builds run stages in parallel automatically

3. **Layer Caching**:
   Order `COPY` commands from least to most frequently changed

### Smaller Images

1. **Use Alpine base**: ✅ Already using `node:18-alpine`
2. **Multi-stage builds**: ✅ Already implemented
3. **Production dependencies**: ✅ Using `npm install --production`

---

## Updating the Image

When you make code changes:

```bash
# 1. Update source code in backend/ and frontend/
# 2. Files auto-sync'd to docker-build/ via git

# 3. Increment version if needed
# Edit build script to change version tag

# 4. Rebuild
./build-and-push.sh

# 5. Test locally before pushing
docker-compose up --build

# 6. Push to Docker Hub (if prompted)
```

---

## Multi-Platform Builds

For Apple Silicon and AMD64 compatibility:

```bash
# Create buildx builder
docker buildx create --name multiplatform --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t thunderdanp/declutter:latest \
  --push \
  .
```

---

## Security Notes

1. **Never commit API keys** to the image
   - Use environment variables
   - Set at runtime via docker-compose or docker run

2. **JWT_SECRET** should be strong
   - Minimum 32 characters
   - Random, not default value

3. **Image Scanning**
   - Run `docker scan thunderdanp/declutter:latest`
   - Update base images regularly

---

## Support

**Build Issues**: Check TESTING.md for detailed test results

**Docker Questions**: See official Docker docs at https://docs.docker.com

**Application Issues**: See README.md and QUICKSTART.md

---

## Summary Checklist

Before building:
- [ ] Docker is installed and running
- [ ] Logged into Docker Hub (if pushing)
- [ ] In project root directory
- [ ] Build script has execute permissions

After building:
- [ ] Image appears in `docker images`
- [ ] Test with docker-compose locally
- [ ] Verify AI integration works
- [ ] Push to Docker Hub (optional)
- [ ] Update deployment docs with new version

---

**Last Updated**: January 2026
**Image Version**: 1.0.0
**Includes**: Claude AI Vision Integration
