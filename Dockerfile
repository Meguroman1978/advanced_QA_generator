# Use Node.js 20 official image
FROM node:20-slim

# Install system dependencies for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1-mesa \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxext6 \
    libx11-6 \
    fonts-liberation \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Set Playwright to use system chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code (including pre-built dist folder)
COPY . .

# Ensure fonts directory exists and has correct permissions
RUN mkdir -p /app/fonts && \
    chmod 755 /app/fonts && \
    ls -la /app/fonts/

# Build only the server (client is pre-built and committed)
RUN npx tsc --project tsconfig.server.json

# Verify dist folder exists with built files
RUN echo "Verifying pre-built dist folder..." && \
    ls -la dist/ && \
    ls -la dist/assets/ && \
    echo "✅ Pre-built dist folder verified"

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
