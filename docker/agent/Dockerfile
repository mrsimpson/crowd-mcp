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

# Install message listener dependencies globally
RUN npm install -g eventsource && \
    echo "=== Message listener dependencies installed ==="

WORKDIR /workspace

# Copy message listener wrapper
COPY message-listener.js /usr/local/bin/message-listener.js
RUN chmod +x /usr/local/bin/message-listener.js

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Start message listener via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
