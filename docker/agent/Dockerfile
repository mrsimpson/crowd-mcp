FROM node:20-alpine

# Debug: Show npm configuration
RUN echo "=== NPM Configuration ===" && \
    npm config get prefix && \
    npm config get globalconfig && \
    npm root -g && \
    npm bin -g

# Install OpenCode globally and verify installation
RUN npm install -g opencode-ai@latest && \
    echo "=== After npm install ===" && \
    npm list -g --depth=0 && \
    ls -la $(npm bin -g) && \
    find /usr -name "*opencode*" 2>/dev/null || true

# Try to find and verify opencode binary
RUN if [ -f "$(npm bin -g)/opencode" ]; then \
      echo "Found opencode at: $(npm bin -g)/opencode" && \
      $(npm bin -g)/opencode --version; \
    else \
      echo "ERROR: opencode binary not found in $(npm bin -g)" && \
      ls -la $(npm root -g)/opencode-ai/bin/ 2>/dev/null || true && \
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
