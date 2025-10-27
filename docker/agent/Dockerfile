FROM node:20-alpine

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

# Try to find and verify opencode binary
RUN GLOBAL_BIN="$(npm config get prefix)/bin" && \
    if [ -f "$GLOBAL_BIN/opencode" ]; then \
      echo "Found opencode at: $GLOBAL_BIN/opencode" && \
      "$GLOBAL_BIN/opencode" --version; \
    else \
      echo "ERROR: opencode binary not found in $GLOBAL_BIN" && \
      echo "Checking node_modules for bin files:" && \
      ls -la "$(npm root -g)/opencode-ai/" 2>/dev/null || true && \
      exit 1; \
    fi

# Ensure npm global bin is in PATH (standard location for node:alpine)
ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /workspace

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Start OpenCode via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
