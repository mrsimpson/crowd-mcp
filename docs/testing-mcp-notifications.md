# Testing MCP Notifications with OpenCode

This guide shows how to test whether OpenCode (or any MCP client) supports MCP notifications.

## Quick Start

### 1. Build the test server

```bash
cd /home/user/crowd-mcp/packages/server
npm run build
```

### 2. Add to OpenCode MCP configuration

Edit your OpenCode MCP configuration file:

- Workspace: `.opencode/mcp.json`
- User: `~/.config/opencode/mcp.json`

Add the notification test server:

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

### 3. Restart OpenCode

The test server should now be available as an MCP server.

### 4. Use the tools

The server provides three tools to test notifications:

#### Send a single notification

```
Use the send_test_notification tool with:
- level: "info" (or "debug", "warning", "error", "critical")
- message: "Your test message here"
```

#### Start a notification stream

```
Use the start_notification_stream tool with:
- interval: 3 (sends a notification every 3 seconds)
```

#### Stop the notification stream

```
Use the stop_notification_stream tool
```

## What to Look For

### If OpenCode supports MCP notifications:

You should see notifications appear somewhere in the UI when:

1. The server connects (welcome notification after 2 seconds)
2. You call `send_test_notification`
3. The notification stream is running

### Possible notification locations:

- **Status bar** - Bottom of the window
- **Sidebar panel** - Dedicated notifications panel
- **Toast/Banner** - Temporary overlay
- **Console/Logs** - In the output/debug console
- **Activity bar** - Badge on an icon

### If OpenCode DOES NOT support MCP notifications:

- Nothing happens when notifications are sent
- Notifications only appear in server logs (stderr)
- Only tool results are shown, not the notifications themselves

## Automated Test

Run the automated test client:

```bash
cd /home/user/crowd-mcp/packages/server
npm run test:notifications
```

This will:

1. Start the notification test server
2. Initialize an MCP connection
3. Send various test notifications
4. Count how many notifications were received
5. Print a summary

**Note:** This tests the JSON-RPC protocol, not the UI display. You still need to check OpenCode's UI manually.

## Testing Scenarios

### Scenario 1: Basic Welcome Notification

1. Add the server to OpenCode MCP config
2. Restart OpenCode
3. Wait 2 seconds after OpenCode starts
4. **Look for:** An "info" level notification saying "MCP Notification Test Server is ready!"

### Scenario 2: Manual Notifications

1. Use the `send_test_notification` tool
2. Send notifications at different levels: `info`, `warning`, `error`, `critical`
3. **Look for:** Notifications appearing in the UI, possibly with different styling

### Scenario 3: Notification Flood

1. Use the `start_notification_stream` tool with interval: 2
2. Let it run for 20 seconds (10 notifications)
3. Use the `stop_notification_stream` tool
4. **Look for:** How does OpenCode handle multiple notifications? Stack them? Auto-dismiss? Show count?

### Scenario 4: Background Notifications

1. Start a notification stream with interval: 5
2. Switch to another window/app
3. **Look for:** Does OpenCode show desktop notifications? System tray alerts? Badge counts?

## Expected Results

### If MCP notifications are supported:

✅ Notifications appear in the UI
✅ Different log levels may have different styling
✅ Notifications are interactive (can dismiss, click, etc.)
✅ Multiple notifications are handled gracefully

### If MCP notifications are NOT supported:

❌ Nothing visible happens when notifications are sent
❌ Only tool call results are shown
❌ No UI updates when notifications arrive
❌ Must use file-based notification system instead

## Debugging

### Check OpenCode Logs

OpenCode may log MCP protocol messages. Look for:

- Connection logs showing the notification-test server
- JSON-RPC messages with method: "notifications/message"
- Any errors related to notifications

### Check Server Logs

The test server logs to stderr:

```
🧪 MCP Notification Test Server starting...
✓ Server connected via stdio
📬 Ready to send test notifications
[NOTIFICATION] INFO: MCP Notification Test Server is ready!
```

If you don't see these logs, the server isn't starting properly.

### Manual JSON-RPC Test

Test the raw protocol:

```bash
# Start the server
node dist/test/notification-test-server.js

# In another terminal, send initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' > /tmp/test.json

cat /tmp/test.json | node dist/test/notification-test-server.js
```

Watch for notifications in the output.

## Alternative: Use with Claude Desktop

If OpenCode doesn't support notifications, test with Claude Desktop to see what notifications SHOULD look like:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

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

Restart Claude Desktop and test the same scenarios. This shows you the "ideal" notification behavior.

## Conclusion Template

After testing, document your findings:

```markdown
## OpenCode MCP Notification Test Results

**Date:** [Date]
**OpenCode Version:** [Version]
**Platform:** [OS]

### Test Results

- [ ] Welcome notification appeared
- [ ] Manual notifications work (`send_test_notification`)
- [ ] Notification stream works (`start_notification_stream`)
- [ ] Different log levels have different styling
- [ ] Can interact with notifications (click/dismiss)

### Notification Display

**Location:** [Where notifications appear - status bar, panel, toast, etc.]
**Styling:** [Colors, icons, formatting]
**Behavior:** [Auto-dismiss, persistent, interactive]
**Limitations:** [Max count, filtering, etc.]

### Recommendation

- [ ] ✅ Use MCP notifications in crowd-mcp (fully supported)
- [ ] ⚠️ Use dual approach (MCP + file-based) (partial support)
- [ ] ❌ Use file-based only (no MCP support)

### Notes

[Additional observations]
```

## Next Steps

Based on your findings:

1. **If notifications work** → Update crowd-mcp to rely on MCP notifications
2. **If notifications don't work** → Use the file-based notification system (already implemented)
3. **If partially work** → Keep the dual approach (MCP + file watching)

The file-based system (developer-notifications.jsonl) is already implemented and works regardless of MCP notification support.
