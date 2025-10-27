# Building the Agent Docker Image

## Quick Start

```bash
# From the project root
docker build -t crowd-mcp-agent:latest -f docker/agent/Dockerfile docker/agent/
```

## Verification

After building, verify that OpenCode is installed:

```bash
docker run --rm crowd-mcp-agent:latest which opencode
# Expected output: /usr/local/bin/opencode (or similar)

docker run --rm crowd-mcp-agent:latest opencode --version
# Expected output: OpenCode version X.X.X
```

## Troubleshooting

### `opencode: not found`

This means either:

1. The image was built before `entrypoint.sh` was added → **Rebuild the image**
2. OpenCode installation failed during build → Check build logs
3. The image tag doesn't match what the server expects → Ensure tag is `crowd-mcp-agent:latest`

**Solution:**

```bash
# Remove old image
docker rmi crowd-mcp-agent:latest

# Rebuild
docker build -t crowd-mcp-agent:latest -f docker/agent/Dockerfile docker/agent/

# Verify
docker run --rm crowd-mcp-agent:latest opencode --version
```

### Build fails during `npm install`

If you see network errors during build:

```bash
# Use --no-cache to force fresh install
docker build --no-cache -t crowd-mcp-agent:latest -f docker/agent/Dockerfile docker/agent/
```

### `entrypoint.sh: not found`

This means the COPY failed. Check that you're building from the correct context:

```bash
# ✅ Correct - context is docker/agent/
docker build -t crowd-mcp-agent:latest -f docker/agent/Dockerfile docker/agent/

# ❌ Wrong - context is project root
docker build -t crowd-mcp-agent:latest -f docker/agent/Dockerfile .
```

## Testing the Image

### Test entrypoint directly

```bash
docker run --rm \
  -e AGENT_ID=test-123 \
  -e TASK="echo hello" \
  -v $(pwd):/workspace \
  crowd-mcp-agent:latest
```

Expected output:

```
=========================================
Crowd-MCP Agent Container
=========================================
Agent ID: test-123
Task: echo hello
Workspace: /workspace
=========================================
Starting OpenCode...

[OpenCode output...]
```

### Test without TASK variable

```bash
docker run --rm \
  -e AGENT_ID=test-123 \
  crowd-mcp-agent:latest
```

Expected output:

```
=========================================
Crowd-MCP Agent Container
=========================================
Agent ID: test-123
Task:
Workspace: /workspace
=========================================
ERROR: No TASK environment variable provided
Container will remain idle. Set TASK to execute OpenCode.
```

Container should keep running (tail -f /dev/null) but not execute OpenCode.

## Development

### Test entrypoint changes without full rebuild

```bash
# Build just the entrypoint changes
docker build --target base -t crowd-mcp-agent:latest -f docker/agent/Dockerfile docker/agent/
```

### Inspect the image

```bash
# List files
docker run --rm crowd-mcp-agent:latest ls -la /

# Check installed packages
docker run --rm crowd-mcp-agent:latest npm list -g

# Interactive shell
docker run --rm -it crowd-mcp-agent:latest sh
```

## Production

### Multi-platform builds

If you need to build for different architectures (e.g., ARM for M1 Macs):

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t crowd-mcp-agent:latest \
  -f docker/agent/Dockerfile \
  docker/agent/
```

### Image optimization

Current image size should be ~200-300MB (Alpine base + Node.js + OpenCode).

To reduce further:

- Use `npm install -g opencode-ai@latest --production` (no dev dependencies)
- Add `.dockerignore` to exclude unnecessary files
- Use multi-stage builds if needed

## Automated Build

Add to your CI/CD pipeline:

```yaml
# .github/workflows/build-agent-image.yml
- name: Build agent image
  run: |
    docker build -t crowd-mcp-agent:latest \
      -f docker/agent/Dockerfile \
      docker/agent/

- name: Test agent image
  run: |
    docker run --rm crowd-mcp-agent:latest opencode --version
```
