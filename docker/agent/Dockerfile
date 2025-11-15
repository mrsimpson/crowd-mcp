FROM node:20-slim

# Install system dependencies including git for repository cloning
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode globally with npm (more stable than bun)
RUN npm install -g opencode-ai@latest

# Install missing dependencies that OpenCode requires
RUN npm install -g jose

# Create OpenCode directories to prevent ENOENT errors
RUN mkdir -p /root/.local/share/opencode/bin

# Setup basic Git configuration at build time
RUN git config --global user.name "Agent Bot" && \
    git config --global user.email "agent@crowd-mcp.local" && \
    git config --global core.sshCommand "ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no" && \
    git config --global init.defaultBranch main

WORKDIR /workspace

# Copy scripts
COPY ./entrypoint.sh /entrypoint.sh
COPY ./setup-git-auth.sh /setup-git-auth.sh
RUN chmod +x /entrypoint.sh /setup-git-auth.sh

# Start OpenCode via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
