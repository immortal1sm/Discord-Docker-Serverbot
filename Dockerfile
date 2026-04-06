# Base image
FROM node:20-alpine

# Install Docker CLI and necessary tools
USER root
RUN apk add --no-cache docker-cli bash curl

# Create working directory first
RUN mkdir -p /usr/src/app

# Create node user and ensure it has docker group access
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    # Add nodejs user to the docker group (group might not exist in Alpine)
    (getent group docker || addgroup -S docker) && \
    addgroup nodejs docker && \
    chown -R nodejs:nodejs /usr/src/app

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy bot code
COPY bot.js ./

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "bot.js"]