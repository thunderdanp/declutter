#!/bin/bash
# Build and push declutter Docker image for linux/amd64

set -e

IMAGE_NAME="thunderdanp/declutter"
TAG="${1:-latest}"
PLATFORM="linux/amd64"

echo "Building $IMAGE_NAME:$TAG for $PLATFORM..."

docker buildx build \
  --platform "$PLATFORM" \
  -t "$IMAGE_NAME:$TAG" \
  --push \
  .

echo "Done! Pushed $IMAGE_NAME:$TAG"
