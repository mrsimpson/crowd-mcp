FROM node:20-slim

# Install system dependencies including git for repository cloning
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun runtime for OpenCode
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Create necessary directories and set permissions
RUN mkdir -p /root/.local/share/opencode/bin \
    && mkdir -p /tmp/bun-cache \
    && chmod -R 755 /root/.local/share/opencode \
    && chmod -R 777 /tmp/bun-cache

# Install OpenCode globally with Bun and pre-install common dependencies
RUN bun install -g opencode-ai@latest

# Pre-install commonly needed packages to avoid runtime installation issues
RUN bun install -g jose hono @types/node

# Set Bun cache directory and disable verification
ENV BUN_INSTALL_CACHE_DIR="/tmp/bun-cache"
ENV BUN_CONFIG_NO_VERIFY="1"

# Setup basic Git configuration at build time (user info will be set at runtime)
RUN git config --global core.sshCommand "ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no" && \
    git config --global init.defaultBranch main

WORKDIR /workspace

# Copy scripts
COPY ./entrypoint.sh /entrypoint.sh
COPY ./setup-git-auth.sh /setup-git-auth.sh
RUN chmod +x /entrypoint.sh /setup-git-auth.sh

# Start OpenCode via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
