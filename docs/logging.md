# Logging Configuration

crowd-mcp provides comprehensive logging for debugging ACP communication and system operations.

## Log Levels

Available log levels (in order of priority):

- `DEBUG` - Detailed debugging information
- `INFO` - General information messages  
- `WARN` - Warning messages (default)
- `ERROR` - Error messages only

## Configuration

### Environment Variable

Set the log level using the `CROWD_LOG_LEVEL` environment variable:

```bash
# Set to DEBUG for verbose logging
export CROWD_LOG_LEVEL=DEBUG

# Set to ERROR for minimal logging
export CROWD_LOG_LEVEL=ERROR

# Default is WARN if not specified
```

### MCP Client Configuration

Configure logging in your MCP client:

**Claude Desktop (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "crowd-mcp": {
      "command": "npx",
      "args": ["-y", "crowd-mcp@latest"],
      "env": {
        "HTTP_PORT": "3000",
        "AGENT_MCP_PORT": "3100",
        "CROWD_LOG_LEVEL": "WARN"
      }
    }
  }
}
```

## Log Files

Logs are written to `.crowd/logs/` directory:

```
.crowd/logs/
├── acp-{agentId}-{timestamp}.log     # ACP protocol communication
├── mcp-local-{timestamp}.log         # Local MCP server operations  
└── mcp-internal-{timestamp}.log      # Internal message routing
```

## Log Levels Usage

### DEBUG
Use for development and troubleshooting:
- All ACP request/response messages
- Session establishment details
- Message chunk processing
- Exponential backoff polling

### INFO  
Use for monitoring:
- Agent lifecycle events
- Session creation/destruction
- Message forwarding

### WARN (Default)
Use for production:
- Configuration warnings
- Retry attempts
- Non-critical errors

### ERROR
Use for minimal logging:
- Critical failures only
- ACP session failures
- Container creation errors

## Examples

### Enable Debug Logging
```bash
CROWD_LOG_LEVEL=DEBUG npx crowd-mcp@latest
```

### Production Logging (Default)
```bash
# Uses WARN level by default
npx crowd-mcp@latest
```

### Disable Most Logging
```bash
CROWD_LOG_LEVEL=ERROR npx crowd-mcp@latest
```

## Log Format

All logs use structured JSON format:

```json
{
  "timestamp": "2025-11-12T10:05:43.717Z",
  "level": "WARN",
  "component": "acp-agent-123",
  "message": "Session establishment taking longer than expected",
  "data": {
    "agentId": "agent-123",
    "attempt": 3,
    "nextDelay": 2000
  }
}
```

This format enables easy parsing and filtering with tools like `jq`:

```bash
# Filter ERROR logs only
cat .crowd/logs/acp-*.log | jq 'select(.level == "ERROR")'

# Show all messages for specific agent
cat .crowd/logs/acp-*.log | jq 'select(.data.agentId == "agent-123")'
```
