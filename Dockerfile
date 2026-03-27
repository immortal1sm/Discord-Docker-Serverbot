# Base image
FROM node:20-alpine

# Install Docker CLI
USER root
RUN apk add --no-cache docker-cli bash curl

# Create docker group and add node user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    addgroup nodejs docker || true

# Create working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy bot code
COPY bot.js ./

# Change ownership
RUN chown -R nodejs:nodejs /usr/src/app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Default command
CMD ["node", "bot.js"]