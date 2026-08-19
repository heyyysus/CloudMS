#!/bin/bash

set -e

echo "Starting deployment..."

# Navigate to app directory
cd "$(dirname "$0")/.." || exit 1

# Pull latest changes from git
echo "Pulling latest changes..."
git pull origin main

echo "Pulling app image..."
docker compose pull app

# Never add `down -v` to this script: postgres_data is a named volume holding
# the production database.
echo "Starting containers..."
docker compose up -d

# `up -d` leaves nginx alone when its service definition is unchanged, so a
# pulled nginx/conf.d edit would otherwise sit unread until the next restart.
echo "Reloading nginx config..."
docker compose restart nginx

# Remove unused images and containers to free up space
echo "Cleaning up unused Docker resources..."
docker system prune -f

echo "Deployment complete!"
echo ""
echo "Container status:"
docker compose ps