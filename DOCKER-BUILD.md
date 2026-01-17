# Building and Publishing Docker Image

This guide shows how to build the Docker image and push it to Docker Hub as `thunderdanp/declutter`.

## Prerequisites

1. **Docker installed** on your system
2. **Docker Hub account** (free at https://hub.docker.com)
3. **Logged in to Docker Hub**:
   ```bash
   docker login
   # Enter your Docker Hub username and password
   ```

## Building the Image

### Step 1: Navigate to Build Directory

```bash
cd docker-build
```

### Step 2: Build the Image

Build for your current platform:
```bash
docker build -t thunderdanp/declutter:latest .
```

**Build for multiple platforms** (recommended for wider compatibility):
```bash
# This requires buildx (included in Docker Desktop)
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t thunderdanp/declutter:latest --push .
```

Platform options:
- `linux/amd64` - Intel/AMD 64-bit (most common)
- `linux/arm64` - ARM 64-bit (Apple M1/M2, Raspberry Pi)
- `linux/arm/v7` - ARM 32-bit (older Raspberry Pi)

### Step 3: Tag with Version (Optional but Recommended)

```bash
# Tag with version number
docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0

# Tag with latest
docker tag thunderdanp/declutter:latest thunderdanp/declutter:latest
```

### Step 4: Push to Docker Hub

Push a specific version:
```bash
docker push thunderdanp/declutter:1.0.0
```

Push latest:
```bash
docker push thunderdanp/declutter:latest
```

Push all tags:
```bash
docker push thunderdanp/declutter --all-tags
```

## Testing the Image Locally

Before pushing, test the image locally:

```bash
# Run just the app container with a test database
docker run -d --name test_postgres \
  -e POSTGRES_DB=declutter_db \
  -e POSTGRES_USER=declutter_user \
  -e POSTGRES_PASSWORD=declutter_password \
  postgres:15-alpine

docker run -d --name test_app \
  -p 3000:80 \
  -e DATABASE_URL=postgresql://declutter_user:declutter_password@test_postgres:5432/declutter_db \
  -e JWT_SECRET=test-secret \
  --link test_postgres:postgres \
  thunderdanp/declutter:latest

# Test the app at http://localhost:3000

# Clean up test containers
docker stop test_app test_postgres
docker rm test_app test_postgres
```

## Automated GitHub Actions Build

Create `.github/workflows/docker-build.yml` in your repository:

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [ main ]
    tags:
      - 'v*'
  pull_request:
    branches: [ main ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: thunderdanp/declutter
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: ./docker-build
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=thunderdanp/declutter:buildcache
          cache-to: type=registry,ref=thunderdanp/declutter:buildcache,mode=max
```

## Image Information

After building and pushing, users can pull and run with:

```bash
docker pull thunderdanp/declutter:latest
```

Or use the provided `docker-compose-hub.yml`:

```bash
docker-compose -f docker-compose-hub.yml up -d
```

## Updating the Image

When you make changes to the application:

1. **Update version number** in your build commands
2. **Rebuild the image**:
   ```bash
   docker buildx build --platform linux/amd64,linux/arm64 \
     -t thunderdanp/declutter:1.1.0 \
     -t thunderdanp/declutter:latest \
     --push .
   ```
3. **Users update** by pulling the new version:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

## Best Practices

1. **Always tag with versions** (e.g., 1.0.0, 1.1.0) in addition to `latest`
2. **Use semantic versioning**: MAJOR.MINOR.PATCH
3. **Build for multiple platforms** to support different architectures
4. **Keep images small** - multi-stage builds help with this
5. **Document changes** in image descriptions on Docker Hub
6. **Security scan** your images:
   ```bash
   docker scout cves thunderdanp/declutter:latest
   ```

## Troubleshooting

**Build fails:**
```bash
# Check Docker daemon is running
docker info

# Clean build cache
docker builder prune
```

**Push fails:**
```bash
# Ensure you're logged in
docker login

# Check repository name matches your Docker Hub username
docker images | grep declutter
```

**Image too large:**
```bash
# Check image size
docker images thunderdanp/declutter

# Analyze layers
docker history thunderdanp/declutter:latest
```

## Docker Hub Repository Settings

On Docker Hub (https://hub.docker.com):

1. **Repository**: thunderdanp/declutter
2. **Visibility**: Public (so anyone can pull)
3. **Description**: Add information about the application
4. **README**: Link to your GitHub repository

## Image Size

Current image size should be approximately:
- Compressed: ~150-200 MB
- Uncompressed: ~400-500 MB

This includes:
- Node.js runtime
- Nginx web server
- Frontend build
- Backend application
