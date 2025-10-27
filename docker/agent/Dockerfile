FROM node:20-alpine

# Install OpenCode globally and verify installation
RUN npm install -g opencode-ai@latest && \
    which opencode && \
    opencode --version

# Ensure npm global bin is in PATH
ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /workspace

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Start OpenCode via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
