FROM node:20-slim

# Install OpenCode globally with npm (more stable than bun)
RUN npm install -g opencode-ai@latest

WORKDIR /workspace

# Copy entrypoint script
COPY docker/agent/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Start OpenCode via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
