# Building Docker Image on macOS

Complete guide for building and pushing the Declutter Assistant Docker image on macOS (Intel and Apple Silicon).

## 📋 Prerequisites

1. **Docker Desktop for Mac** installed and running
   - Download: https://www.docker.com/products/docker-desktop/
   - Make sure it's running (check menu bar for whale icon 🐳)

2. **Docker Hub account**
   - Create free account: https://hub.docker.com/signup

3. **Terminal** (included with macOS)

## 🚀 Quick Start (Automated)

### Step 1: Extract Files

Extract `declutter-assistant-final.zip` to a folder:
```bash
cd ~/Downloads
unzip declutter-assistant-final.zip
cd declutter-assistant
```

### Step 2: Run the Build Script

```bash
./build-and-push-macos.sh
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

```bash
docker login
```

Enter your Docker Hub credentials:
- Username: `thunderdanp`
- Password: [your Docker Hub password]

### Step 2: Navigate to Build Directory

```bash
cd declutter-assistant/docker-build
```

### Step 3: Build the Image

**Option A - Single Platform (Faster):**
```bash
# Build the image
docker build -t thunderdanp/declutter:latest .

# Tag with version
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0

# Push to Docker Hub
docker push thunderdanp/declutter:latest
docker push thunderdanp/declutter:1.0.0
```

**Option B - Multi-Platform (Recommended for Apple Silicon):**
```bash
# Create buildx builder
docker buildx create --name declutter-builder --use

# Build and push for multiple platforms
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t thunderdanp/declutter:latest \
    -t thunderdanp/declutter:1.0.0 \
    --push \
    .
```

### Step 4: Verify

```bash
# Check locally
docker images | grep declutter

# Or pull from Docker Hub
docker pull thunderdanp/declutter:latest
```

---

## 🍎 Apple Silicon (M1/M2/M3) Specific

If you're on Apple Silicon Mac:

### Important Notes

- **Multi-platform build recommended**: Ensures compatibility with Intel Macs
- **Native arm64 support**: Your Mac can build arm64 images natively
- **Rosetta not needed**: Docker Desktop handles architecture translation

### Recommended Command

```bash
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t thunderdanp/declutter:latest \
    --push \
    .
```

This builds for both Intel (amd64) and ARM (arm64) architectures.

---

## 🧪 Testing the Image

Before sharing with others, test it works:

```bash
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

### "Cannot connect to the Docker daemon"

**Solution:**
1. Open Docker Desktop from Applications
2. Wait for it to fully start
3. Look for whale icon 🐳 in menu bar
4. Try command again

### "docker buildx: unknown command"

**Solution:**
```bash
# Update Docker Desktop to latest version
# Or use single-platform build (Option A)
```

### "denied: requested access to resource is denied"

**Solution:**
```bash
# Make sure you're logged in
docker login

# Check username
docker info | grep Username
```

### Build Fails with Architecture Error

**Apple Silicon specific:**
```bash
# If you get architecture mismatch errors, explicitly set:
docker buildx build \
    --platform linux/arm64,linux/amd64 \
    -t thunderdanp/declutter:latest \
    --push \
    .
```

### "no space left on device"

**Solution:**
```bash
# Clean up Docker
docker system prune -a

# Then try building again
```

### Permission Denied on Script

**Solution:**
```bash
chmod +x build-and-push-macos.sh
./build-and-push-macos.sh
```

---

## 📊 Build Progress

You'll see output like:

```
[+] Building 234.5s (15/15) FINISHED
Step 1/15 : FROM node:18-alpine AS backend-deps
Step 2/15 : WORKDIR /backend
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

```bash
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
- ✅ Platforms: linux/amd64, linux/arm64 (if multi-platform build)

### 3. Test Pull from Docker Hub

```bash
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
4. ✅ Works on Intel and Apple Silicon Macs

---

## 📝 Quick Reference Commands

```bash
# Complete build and push (one command, single platform)
cd docker-build && docker build -t thunderdanp/declutter:latest . && \
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0 && \
docker push thunderdanp/declutter:latest && \
docker push thunderdanp/declutter:1.0.0

# Multi-platform (if buildx works)
docker buildx build --platform linux/amd64,linux/arm64 \
    -t thunderdanp/declutter:latest \
    -t thunderdanp/declutter:1.0.0 \
    --push .

# Test locally
docker run -p 3000:80 \
    -e DATABASE_URL=postgresql://user:pass@localhost/db \
    -e JWT_SECRET=test \
    thunderdanp/declutter:latest

# View logs
docker logs declutter_app

# Clean up
docker system prune -a
```

---

## 🔄 Updating the Image Later

When you make changes:

```bash
cd docker-build

# Rebuild
docker build -t thunderdanp/declutter:latest .
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.1.0

# Push
docker push thunderdanp/declutter:latest
docker push thunderdanp/declutter:1.1.0
```

Users update with:
```bash
docker-compose pull
docker-compose up -d
```

---

## 💡 Tips for macOS

- **First build is slow** (3-5 min) - subsequent builds are faster with cache
- **Multi-platform** recommended on Apple Silicon for maximum compatibility
- **Docker Desktop must be running** before any docker commands
- **Use Terminal or iTerm2** for best experience
- **Homebrew users**: If you installed Docker via brew, ensure Docker Desktop is running

---

## 🍎 Apple Silicon vs Intel

### Apple Silicon (M1/M2/M3):
- Native arm64 builds are very fast
- Can build both arm64 and amd64 via emulation
- Recommended: Multi-platform build

### Intel Macs:
- Native amd64 builds
- Can build arm64 via emulation (slower)
- Single platform build is fine if all users have Intel

### Which to Choose?

**If you have Apple Silicon:**
```bash
# Build for both architectures (recommended)
docker buildx build --platform linux/amd64,linux/arm64 ...
```

**If you have Intel Mac:**
```bash
# Single platform is faster and sufficient
docker build -t thunderdanp/declutter:latest .
```

---

## 📞 Need Help?

- Docker Desktop issues: https://docs.docker.com/desktop/mac/troubleshoot/
- Docker Hub: https://docs.docker.com/docker-hub/
- Apple Silicon specific: https://docs.docker.com/desktop/mac/apple-silicon/

---

## 🎯 Next Steps

After building and pushing:

1. ✅ Verify image on Docker Hub
2. ✅ Test with `docker-compose-simple.yml`
3. ✅ Share `declutter-zero-setup.zip` with users
4. ✅ Users deploy with one command!
