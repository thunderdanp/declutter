# Building Docker Image on Windows

Complete guide for building and pushing the Declutter Assistant Docker image using Windows.

## 📋 Prerequisites

1. **Docker Desktop for Windows** installed and running
   - Download: https://www.docker.com/products/docker-desktop/
   - Make sure it's running (check system tray)

2. **Docker Hub account**
   - Create free account: https://hub.docker.com/signup

3. **PowerShell** (comes with Windows)

## 🚀 Quick Start (Automated)

### Step 1: Extract Files

Extract `github-ready.zip` to a folder, for example:
```
C:\Users\YourName\declutter-assistant\
```

### Step 2: Open PowerShell

Right-click in the folder and select:
- **"Open in Windows Terminal"** (Windows 11)
- or **"Open PowerShell window here"** (Windows 10)

Or manually:
```powershell
cd C:\Users\YourName\declutter-assistant\github-ready
```

### Step 3: Run the Build Script

```powershell
.\build-and-push.ps1
```

The script will:
- ✅ Check Docker is running
- ✅ Check Docker Hub login (prompts if needed)
- ✅ Ask you to choose build method
- ✅ Build the Docker image
- ✅ Push to Docker Hub

**Time:** 3-5 minutes

---

## 🔨 Manual Build Commands

If you prefer to run commands manually:

### Step 1: Login to Docker Hub

```powershell
docker login
```

Enter your Docker Hub credentials:
- Username: `thunderdanp`
- Password: [your Docker Hub password]

### Step 2: Navigate to Build Directory

```powershell
cd github-ready
cd docker-build
```

### Step 3: Build the Image

**Option A - Single Platform (Faster, amd64 only):**
```powershell
# Build the image
docker build -t thunderdanp/declutter:latest .

# Tag with version
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0

# Push to Docker Hub
docker push thunderdanp/declutter:latest
docker push thunderdanp/declutter:1.0.0
```

**Option B - Multi-Platform (Recommended, amd64 + arm64):**
```powershell
# Enable buildx
docker buildx create --use

# Build and push for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 `
    -t thunderdanp/declutter:latest `
    -t thunderdanp/declutter:1.0.0 `
    --push `
    .
```

**Note:** In PowerShell, use backtick `` ` `` for line continuation (not backslash `\`)

### Step 4: Verify

```powershell
# Check locally
docker images | Select-String "declutter"

# Or pull from Docker Hub
docker pull thunderdanp/declutter:latest
```

---

## 🧪 Testing the Image

Before sharing with others, test it works:

```powershell
# Go back to main directory
cd ..

# Test with compose
docker-compose -f docker-compose-simple.yml up

# Should start successfully
# Open browser to: http://localhost:3000
# Create account and test
```

Press `Ctrl+C` to stop when done testing.

---

## ⚠️ Troubleshooting

### "Docker is not running"

**Solution:**
1. Open Docker Desktop
2. Wait for it to fully start
3. Look for whale icon in system tray
4. Try command again

### "Cannot connect to Docker daemon"

**Solution:**
```powershell
# Restart Docker Desktop
# Or in PowerShell (as Administrator):
Restart-Service docker
```

### "docker buildx: unknown command"

**Solution:**
- Update Docker Desktop to latest version
- Or use single-platform build (Option A above)

### "denied: requested access to resource is denied"

**Solution:**
```powershell
# Make sure you're logged in
docker login

# Check username
docker info | Select-String "Username"
```

### PowerShell Execution Policy Error

**Error:**
```
cannot be loaded because running scripts is disabled
```

**Solution:**
```powershell
# Run PowerShell as Administrator, then:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then try the script again
```

### Build Fails with "no space left on device"

**Solution:**
```powershell
# Clean up Docker
docker system prune -a

# Then try building again
```

---

## 📊 Build Progress

You'll see output like:

```
Step 1/15 : FROM node:18-alpine AS backend-deps
Step 2/15 : WORKDIR /backend
Step 3/15 : COPY backend/package*.json ./
...
Successfully built abc123def456
Successfully tagged thunderdanp/declutter:latest
Successfully tagged thunderdanp/declutter:1.0.0
Pushing to thunderdanp/declutter:latest...
```

This is normal and takes 3-5 minutes.

---

## ✅ Verification Steps

After building, verify everything worked:

### 1. Check Local Images

```powershell
docker images
```

Should show:
```
REPOSITORY               TAG       SIZE
thunderdanp/declutter   latest    ~400MB
thunderdanp/declutter   1.0.0     ~400MB
```

### 2. Check Docker Hub

Visit: https://hub.docker.com/r/thunderdanp/declutter

Should see:
- ✅ Image exists
- ✅ Tagged as `latest` and `1.0.0`
- ✅ Status: Public

### 3. Test Pull from Docker Hub

```powershell
# Remove local images
docker rmi thunderdanp/declutter:latest

# Pull from Docker Hub
docker pull thunderdanp/declutter:latest

# Should download successfully
```

---

## 🎉 Success!

Once your image is on Docker Hub:

1. ✅ The zero-setup package will work
2. ✅ Users can deploy instantly
3. ✅ No source code needed by users

---

## 📝 Quick Reference

```powershell
# Complete build and push (one-liner, single platform)
docker build -t thunderdanp/declutter:latest . ; docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0 ; docker push thunderdanp/declutter:latest ; docker push thunderdanp/declutter:1.0.0

# Multi-platform (if buildx works)
docker buildx build --platform linux/amd64,linux/arm64 -t thunderdanp/declutter:latest -t thunderdanp/declutter:1.0.0 --push .

# Test locally
docker run -p 3000:80 -e DATABASE_URL=postgresql://user:pass@localhost/db -e JWT_SECRET=test thunderdanp/declutter:latest

# View logs
docker logs declutter_app

# Clean up
docker system prune -a
```

---

## 🔄 Updating the Image Later

When you make changes:

```powershell
cd github-ready\docker-build

# Rebuild
docker build -t thunderdanp/declutter:latest .
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.1.0

# Push
docker push thunderdanp/declutter:latest
docker push thunderdanp/declutter:1.1.0
```

Users update with:
```powershell
docker-compose pull
docker-compose up -d
```

---

## 💡 Tips

- **First build is slow** (3-5 min) - subsequent builds are faster
- **Multi-platform** builds support more users but take longer
- **Single platform** is fine if you know users have amd64/x64 systems
- **Docker Desktop must be running** before any docker commands
- Use **PowerShell** (not Command Prompt) for better experience

---

## 📞 Need Help?

- Docker Desktop issues: https://docs.docker.com/desktop/troubleshoot/overview/
- Docker Hub: https://docs.docker.com/docker-hub/
- This guide: See BUILD-IMAGE-FIRST.md
