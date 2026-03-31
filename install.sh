#!/bin/bash
set -e

echo "Installing olms (LMStudio Ollama Bridge)..."

# Define your GitHub repository here
GITHUB_REPO="thodinh/olms" # USER: Please update this to your actual GitHub repository

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

if [ "$ARCH" = "x86_64" ]; then
    ARCH="amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH="arm64"
fi

if [ "$OS" = "darwin" ]; then
    OS="darwin"
elif [ "$OS" = "linux" ]; then
    OS="linux"
else
    echo "Unsupported OS: $OS. You can still run it manually with Bun."
    exit 1
fi

BINARY_NAME="olms-${OS}-${ARCH}"

echo "Detecting latest release from ${GITHUB_REPO}..."
LATEST_URL=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep "browser_download_url.*${BINARY_NAME}\"" | cut -d '"' -f 4)

if [ -z "$LATEST_URL" ]; then
    echo "Error: Could not find binary for $OS-$ARCH in the latest release at $GITHUB_REPO."
    echo "Are you sure the repository is public and has a release?"
    exit 1
fi

echo "Downloading from $LATEST_URL..."
curl -sL "$LATEST_URL" -o /tmp/olms
chmod +x /tmp/olms

# Install to /usr/local/bin
if [ -w /usr/local/bin ]; then
    mv /tmp/olms /usr/local/bin/olms
else
    echo "Requesting sudo privileges to install to /usr/local/bin..."
    sudo mv /tmp/olms /usr/local/bin/olms
fi

echo "✅ Installed successfully to /usr/local/bin/olms"
echo "Run 'olms' to start the proxy!"
