#!/usr/bin/env bash
# install-docker.sh — Install Docker Engine using the official convenience script.
# Supports Linux (Debian/Ubuntu/Fedora/CentOS) and macOS (via Homebrew).
set -euo pipefail

echo "=== OpenKick Docker Installer ==="

if command -v docker &>/dev/null; then
  echo "Docker is already installed: $(docker --version)"
  # Try to start the daemon if not running
  if ! docker info &>/dev/null 2>&1; then
    echo "Docker daemon is not running. Attempting to start..."
    if [[ "$(uname)" == "Darwin" ]]; then
      open -a Docker 2>/dev/null || echo "Please start Docker Desktop manually."
    else
      sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || echo "Could not start Docker daemon automatically."
    fi
  fi
  exit 0
fi

OS="$(uname)"
echo "Detected OS: $OS"

if [[ "$OS" == "Linux" ]]; then
  echo "Installing Docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start docker 2>/dev/null || true
  # Add current user to docker group to avoid sudo
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  echo "Docker installed. You may need to log out and back in for group changes."
elif [[ "$OS" == "Darwin" ]]; then
  if command -v brew &>/dev/null; then
    echo "Installing Docker via Homebrew..."
    brew install --cask docker
    echo "Docker Desktop installed. Starting it now..."
    open -a Docker
    echo "Waiting for Docker to start (this may take a moment)..."
    for i in $(seq 1 30); do
      if docker info &>/dev/null 2>&1; then
        echo "Docker is ready."
        exit 0
      fi
      sleep 2
    done
    echo "Docker Desktop is starting. Please wait for it to finish loading."
  else
    echo "ERROR: Homebrew is required to install Docker on macOS."
    echo "Install Homebrew first: https://brew.sh"
    exit 1
  fi
else
  echo "ERROR: Unsupported OS '$OS'. Please install Docker manually: https://docs.docker.com/get-docker/"
  exit 1
fi

echo "=== Docker installation complete ==="
