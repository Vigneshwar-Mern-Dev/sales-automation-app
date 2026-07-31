#!/bin/bash
set -e

echo "Starting AWS Server Setup..."

# Update and upgrade packages
sudo apt-get update
sudo apt-get upgrade -y

# Create a 2GB Swap File (Crucial for t3.micro instances running Puppeteer)
echo "Setting up 2GB swap file to prevent out-of-memory errors..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap file created successfully."
else
    echo "Swap file already exists."
fi

# Install Node.js v20
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Install Chromium dependencies for whatsapp-web.js (Puppeteer)
echo "Installing Chromium dependencies for WhatsApp Worker..."
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2t64 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

# Install build tools just in case
sudo apt-get install -y build-essential

# Optionally install PostgreSQL client to manually check the database connection
sudo apt-get install -y postgresql-client

echo "========================================="
echo "✅ Server Setup Complete!"
echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "PM2 version: $(pm2 -v)"
echo "Chromium dependencies installed."
echo "========================================="
