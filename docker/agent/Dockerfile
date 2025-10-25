FROM node:20-alpine

# Install OpenCode
RUN npm install -g opencode-ai@latest

WORKDIR /workspace

# Keep container running
CMD ["tail", "-f", "/dev/null"]
