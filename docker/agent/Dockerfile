FROM node:20-slim

# Debug: Show npm configuration
RUN echo "=== NPM Configuration ===" && \
    echo "npm version: $(npm --version)" && \
    echo "npm prefix: $(npm config get prefix)" && \
    echo "npm root -g: $(npm root -g)" && \
    echo "npm global bin should be: $(npm config get prefix)/bin"

# Install OpenCode globally and verify installation
RUN npm install -g opencode-ai@latest && \
    echo "=== After npm install ===" && \
    npm list -g --depth=0 && \
    ls -la "$(npm config get prefix)/bin" && \
    find /usr -name "*opencode*" 2>/dev/null || true

# Copy and run debug script to verify OpenCode installation
COPY debug-opencode.sh /tmp/debug-opencode.sh
RUN chmod +x /tmp/debug-opencode.sh && /tmp/debug-opencode.sh

# Ensure npm global bin is in PATH (standard location for node:alpine)
ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /workspace

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Start OpenCode via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
