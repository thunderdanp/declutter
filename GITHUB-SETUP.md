# GitHub Repository Setup Guide

This guide shows how to set up your GitHub repository to automatically build and publish Docker images.

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `declutter-assistant`
3. Description: "Smart home organization and decluttering assistant"
4. Visibility: Public (so Docker Hub can pull)
5. Click "Create repository"

## Step 2: Upload Files to Repository

### Option A: Using GitHub Web Interface

1. Click "uploading an existing file"
2. Drag and drop the entire `docker-build` folder
3. Also upload:
   - `.github/workflows/docker-build.yml`
   - `DOCKER-HUB-README.md`
   - `README.md`
   - `DOCKER-BUILD.md`
   - Other documentation files
4. Commit changes

### Option B: Using Git Command Line

```bash
# Initialize repository
cd /path/to/declutter-assistant
git init
git add .
git commit -m "Initial commit"

# Add remote and push
git remote add origin https://github.com/thunderdanp/declutter-assistant.git
git branch -M main
git push -u origin main
```

## Step 3: Set Up Docker Hub

1. **Create Docker Hub Account** (if you don't have one)
   - Go to https://hub.docker.com
   - Sign up for free account

2. **Create Repository**
   - Click "Create Repository"
   - Name: `declutter`
   - Visibility: Public
   - Description: "Declutter Assistant - Smart home organization tool"
   - Click "Create"

3. **Create Access Token**
   - Click your profile → Account Settings → Security
   - Click "New Access Token"
   - Description: `GitHub Actions - declutter-assistant`
   - Access permissions: Read & Write
   - Click "Generate"
   - **Copy the token** (you won't see it again!)

## Step 4: Configure GitHub Secrets

1. Go to your GitHub repository
2. Click Settings → Secrets and variables → Actions
3. Click "New repository secret"

**Add these two secrets:**

**Secret 1:**
- Name: `DOCKERHUB_USERNAME`
- Value: Your Docker Hub username (e.g., `thunderdanp`)

**Secret 2:**
- Name: `DOCKERHUB_TOKEN`
- Value: The access token you copied from Docker Hub

## Step 5: Trigger First Build

### Option A: Push to Trigger Build

```bash
git add .
git commit -m "Trigger Docker build"
git push
```

### Option B: Manual Trigger

1. Go to repository → Actions
2. Click "Build and Push Docker Image"
3. Click "Run workflow"
4. Select branch: main
5. Click "Run workflow"

## Step 6: Monitor Build

1. Go to repository → Actions
2. Click on the running workflow
3. Watch the build progress
4. Build typically takes 5-10 minutes

## Step 7: Verify Image on Docker Hub

1. Go to https://hub.docker.com/r/thunderdanp/declutter
2. Check that image appears with `latest` tag
3. Verify platforms: `linux/amd64`, `linux/arm64`

## Repository Structure

Your repository should look like:

```
declutter-assistant/
├── .github/
│   └── workflows/
│       └── docker-build.yml       # GitHub Actions workflow
├── docker-build/                  # Docker build context
│   ├── Dockerfile                 # Multi-stage Dockerfile
│   ├── docker-entrypoint.sh      # Startup script
│   ├── nginx.conf                # Nginx configuration
│   ├── backend/                  # Backend source
│   └── frontend/                 # Frontend source
├── README.md                      # Main documentation
├── DOCKER-BUILD.md               # Build instructions
├── DOCKER-HUB-README.md          # Docker Hub description
├── DEPLOY-PREBUILT.md            # Deployment guide
├── QUICKSTART.md                 # Quick start guide
└── REVERSE-PROXY-SETUP.md        # Reverse proxy guide
```

## Automated Builds

The GitHub Action will automatically build and push images when:

✅ **Push to main/master branch** → Builds `latest` tag  
✅ **Create version tag** (e.g., `v1.0.0`) → Builds version tags  
✅ **Pull request** → Builds but doesn't push (for testing)  
✅ **Manual trigger** → Run workflow manually  

## Creating Version Releases

To create a versioned release:

```bash
# Tag the commit
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# This creates tags:
# - thunderdanp/declutter:1.0.0
# - thunderdanp/declutter:1.0
# - thunderdanp/declutter:1
# - thunderdanp/declutter:latest
```

## Updating the Image

When you make changes:

```bash
# 1. Make your changes to code
# 2. Commit changes
git add .
git commit -m "Description of changes"

# 3. Push to GitHub
git push

# 4. GitHub Actions automatically builds and pushes new image

# 5. Users update with:
docker-compose pull
docker-compose up -d
```

## Branch Protection (Optional)

Protect your main branch:

1. Settings → Branches
2. Add rule for `main`
3. Enable:
   - Require pull request reviews
   - Require status checks to pass (Docker build)
   - Require branches to be up to date

## Troubleshooting

### Build Fails

**Check GitHub Actions logs:**
1. Go to Actions tab
2. Click on failed workflow
3. Expand failed steps to see errors

**Common issues:**
- Docker Hub credentials incorrect
- Dockerfile syntax error
- Missing files in build context
- Platform build issues

**Solutions:**
```bash
# Test build locally first
cd docker-build
docker build -t test .

# Check secrets are set correctly
# Settings → Secrets → Actions
```

### Image Not Appearing on Docker Hub

**Verify:**
- Build completed successfully in GitHub Actions
- Docker Hub credentials are correct
- Repository name matches (thunderdanp/declutter)
- Repository is public on Docker Hub

### Multi-Platform Build Issues

If ARM build fails:

```yaml
# In .github/workflows/docker-build.yml
# Temporarily build only for amd64:
platforms: linux/amd64  # Remove linux/arm64
```

## Local Testing Before Push

Test the Docker build locally:

```bash
cd docker-build

# Test build
docker build -t thunderdanp/declutter:test .

# Test run
docker run -d -p 3000:80 \
  -e DATABASE_URL=postgresql://user:pass@postgres:5432/db \
  -e JWT_SECRET=test \
  thunderdanp/declutter:test

# Access at http://localhost:3000
```

## Best Practices

1. ✅ **Test builds locally** before pushing
2. ✅ **Use semantic versioning** (v1.0.0, v1.1.0)
3. ✅ **Update DOCKER-HUB-README.md** when changing features
4. ✅ **Tag releases** for important versions
5. ✅ **Monitor build times** and optimize if >10 minutes
6. ✅ **Keep secrets secure** - never commit them
7. ✅ **Document changes** in commit messages

## Next Steps

After setup:

1. ✅ Verify image builds successfully
2. ✅ Test pulling and running image
3. ✅ Update README with actual repository URLs
4. ✅ Create first release (v1.0.0)
5. ✅ Share deployment instructions with users

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [Docker Build Documentation](https://docs.docker.com/build/)
