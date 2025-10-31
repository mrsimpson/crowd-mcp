# MCP Notification Test Server

A simple standalone MCP server to test how clients handle notifications.

## Purpose

This server helps answer the question: **"Does my MCP client (OpenCode, Claude Desktop, etc.) actually respond to MCP notifications?"**

It sends test notifications at different log levels and provides tools to trigger notifications on demand.

## Quick Start

### 1. Build the server

```bash
cd /home/user/crowd-mcp/packages/server
npm run build
```

### 2. Run standalone (for manual testing)

```bash
node dist/test/notification-test-server.js
```

The server will wait for JSON-RPC messages on stdin. You can test it manually:

```bash
# Send initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/test/notification-test-server.js
```

### 3. Configure in MCP Client

Add to your MCP client configuration:

#### For Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "notification-test": {
      "command": "node",
      "args": [
        "/home/user/crowd-mcp/packages/server/dist/test/notification-test-server.js"
      ]
    }
  }
}
```

#### For OpenCode (`~/.config/opencode/mcp.json` or workspace `.opencode/mcp.json`):

```json
{
  "mcpServers": {
    "notification-test": {
      "command": "node",
      "args": [
        "/home/user/crowd-mcp/packages/server/dist/test/notification-test-server.js"
      ],
      "env": {}
    }
  }
}
```

### 4. Restart your MCP client

Restart Claude Desktop or OpenCode to load the new server.

## Available Tools

Once connected, the server provides these tools:

### `send_test_notification`

Send a single test notification immediately.

**Parameters:**

- `level` (required): Log level - `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, or `emergency`
- `message` (required): Message content

**Example:**

```javascript
// In your MCP client
callTool("send_test_notification", {
  level: "warning",
  message: "This is a test warning notification",
});
```

### `start_notification_stream`

Start sending periodic notifications every N seconds.

**Parameters:**

- `interval` (optional): Seconds between notifications (default: 5)

**Example:**

```javascript
callTool("start_notification_stream", { interval: 3 });
```

This will send notifications cycling through different log levels:

- Notification #1: `debug`
- Notification #2: `info`
- Notification #3: `notice`
- Notification #4: `warning`
- Notification #5: `error`
- (repeats)

### `stop_notification_stream`

Stop the periodic notification stream.

**Example:**

```javascript
callTool("stop_notification_stream", {});
```

## Expected Behavior

### What SHOULD happen:

1. **Welcome notification** - 2 seconds after connection, you should see an `info` level notification
2. **Tool-triggered notifications** - When you call `send_test_notification`, the notification should appear in the client UI
3. **Periodic notifications** - When streaming is active, notifications appear every N seconds
4. **Different visual treatments** - Different log levels may have different colors/icons/positions

### What to observe:

- ✅ **Do notifications appear at all?**
- ✅ **Where do they appear?** (sidebar, banner, console, logs, etc.)
- ✅ **Are different log levels styled differently?**
- ✅ **Do they persist or auto-dismiss?**
- ✅ **Can users interact with them?** (click, dismiss, etc.)
- ✅ **Is there a notification center/history?**

## Testing Scenarios

### Scenario 1: Basic Notification

```javascript
// Send a simple info notification
callTool("send_test_notification", {
  level: "info",
  message: "Hello from MCP notification test!",
});
```

**Look for:** Where does it appear? How is it styled?

### Scenario 2: Different Log Levels

```javascript
// Try each level
const levels = ["debug", "info", "notice", "warning", "error", "critical"];
for (const level of levels) {
  callTool("send_test_notification", {
    level: level,
    message: `This is a ${level} level notification`,
  });
}
```

**Look for:** Do different levels look different? Are some filtered out?

### Scenario 3: Notification Stream

```javascript
// Start a stream to see multiple notifications
callTool("start_notification_stream", { interval: 2 });

// Let it run for 20 seconds, then stop
setTimeout(() => {
  callTool("stop_notification_stream", {});
}, 20000);
```

**Look for:** Do they stack? Auto-dismiss? Flood the UI?

### Scenario 4: High Priority Alert

```javascript
// Send a critical alert
callTool("send_test_notification", {
  level: "critical",
  message: "CRITICAL: This is a high-priority alert that needs attention!",
});
```

**Look for:** Does it demand attention? Modal? Sound? Desktop notification?

## Debugging

### Server logs

The server logs to stderr (won't interfere with MCP protocol on stdout):

```
🧪 MCP Notification Test Server starting...
✓ Server connected via stdio
📬 Ready to send test notifications

Available tools:
  • send_test_notification - Send a single test notification
  • start_notification_stream - Start periodic notifications
  • stop_notification_stream - Stop periodic notifications

Waiting for client requests...
[NOTIFICATION] INFO: MCP Notification Test Server is ready!
```

### If notifications don't appear:

1. **Check client logs** - Look for MCP protocol errors
2. **Verify server connection** - Check that the server appears in the client's MCP server list
3. **Test with Claude Desktop first** - It has known good notification support
4. **Check notification settings** - Some clients may have notification preferences
5. **Try different log levels** - Some clients filter by log level

### Manual protocol testing

Test the raw JSON-RPC protocol:

```bash
# Start server
node dist/test/notification-test-server.js

# In another terminal, send a notification trigger
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_test_notification","arguments":{"level":"info","message":"Test"}}}' | node dist/test/notification-test-server.js
```

## Findings Template

When testing with a new client, document:

```markdown
## MCP Client: [Name] v[Version]

**Date:** [Date]
**Platform:** [OS]

### Notification Support

- [ ] Welcome notification appeared
- [ ] Manual notifications work
- [ ] Periodic notifications work
- [ ] Different log levels styled differently

### UI Behavior

**Location:** [Where notifications appear]
**Styling:** [How they look]
**Interaction:** [Can click/dismiss/etc.]
**Persistence:** [Auto-dismiss? Stay visible?]

### Log Level Support

- [ ] debug - [behavior]
- [ ] info - [behavior]
- [ ] notice - [behavior]
- [ ] warning - [behavior]
- [ ] error - [behavior]
- [ ] critical - [behavior]
- [ ] alert - [behavior]
- [ ] emergency - [behavior]

### Conclusion

[Summary of findings and recommendation]
```

## Next Steps

Based on findings:

1. **If notifications work** → Use MCP notifications in crowd-mcp
2. **If notifications don't work** → Use file-based notification system
3. **If partially work** → Use dual approach (file + MCP)

## Code Structure

```typescript
// The notification format sent by this server
{
  method: "notifications/message",
  params: {
    level: "info",           // RFC 5424 log level
    logger: "notification-test",  // Logger name
    data: {                  // Arbitrary data payload
      message: "...",
      timestamp: "...",
      // ... custom fields
    }
  }
}
```

This matches the MCP Logging Protocol specification exactly.
