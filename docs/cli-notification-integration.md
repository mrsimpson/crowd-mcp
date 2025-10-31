# CLI Notification Integration Guide

This guide shows how to integrate the crowd-mcp notification system into your CLI without modifying the MCP server.

## Overview

When agents send messages to the developer, the server writes notifications to a dedicated file:

```
.crowd/sessions/{sessionId}/developer-notifications.jsonl
```

The CLI can watch this file using file system events and display notifications to the user in real-time.

## Notification File Format

Each line is a JSON object with the following structure:

```json
{
  "timestamp": 1234567890,
  "messageId": "abc-123",
  "from": "agent-xyz",
  "priority": "high",
  "preview": "Task completed successfully..."
}
```

- **timestamp**: Unix timestamp (milliseconds) when message was received
- **messageId**: Unique message ID (for fetching full content via `get_messages()`)
- **from**: Agent ID that sent the message
- **priority**: Message priority (`low`, `normal`, or `high`)
- **preview**: First 150 characters of the message content

## Implementation Options

### Option 1: Node.js with fs.watch

```javascript
import { watch } from 'fs';
import { readFile } from 'fs/promises';

let lastSize = 0;

// Get notification file path from server startup logs
const notificationFile = './.crowd/sessions/12345/developer-notifications.jsonl';

watch(notificationFile, async (eventType) => {
  if (eventType === 'change') {
    // Read only new lines (file is append-only)
    const content = await readFile(notificationFile, 'utf-8');
    const newContent = content.slice(lastSize);
    lastSize = content.length;

    // Parse new notifications
    const lines = newContent.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const notification = JSON.parse(line);
      displayNotification(notification);
    }
  }
});

function displayNotification(notification) {
  console.log(`\n📬 New message from ${notification.from} (${notification.priority})`);
  console.log(`   ${notification.preview}`);
  console.log(`   [Use get_messages() to read full content]\n`);
}
```

### Option 2: Node.js with chokidar (Recommended)

```javascript
import chokidar from 'chokidar';
import { readFile } from 'fs/promises';

let lastPosition = 0;

const notificationFile = './.crowd/sessions/12345/developer-notifications.jsonl';

const watcher = chokidar.watch(notificationFile, {
  persistent: true,
  usePolling: false, // Use native FS events
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50
  }
});

watcher.on('change', async (path) => {
  const content = await readFile(path, 'utf-8');
  const newContent = content.slice(lastPosition);
  lastPosition = content.length;

  const lines = newContent.trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const notification = JSON.parse(line);
    await handleNotification(notification);
  }
});

async function handleNotification(notification) {
  // Display desktop notification
  if (notification.priority === 'high') {
    showDesktopNotification({
      title: `Message from ${notification.from}`,
      body: notification.preview,
      urgency: 'critical'
    });
  }

  // Show in UI
  addNotificationBadge(notification);

  // Auto-fetch full message if high priority
  if (notification.priority === 'high') {
    const messages = await mcpClient.callTool('get_messages', {
      unreadOnly: true,
      limit: 1
    });
    displayFullMessage(messages[0]);
  }
}
```

### Option 3: Python

```python
import json
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class NotificationHandler(FileSystemEventHandler):
    def __init__(self, file_path):
        self.file_path = file_path
        self.last_position = 0

    def on_modified(self, event):
        if event.src_path == self.file_path:
            with open(self.file_path, 'r') as f:
                f.seek(self.last_position)
                new_lines = f.readlines()
                self.last_position = f.tell()

                for line in new_lines:
                    if line.strip():
                        notification = json.loads(line)
                        self.handle_notification(notification)

    def handle_notification(self, notification):
        print(f"\n📬 New message from {notification['from']}")
        print(f"   {notification['preview']}")
        print(f"   [Priority: {notification['priority']}]\n")

# Usage
notification_file = './.crowd/sessions/12345/developer-notifications.jsonl'
event_handler = NotificationHandler(notification_file)
observer = Observer()
observer.schedule(event_handler, path='./.crowd/sessions/12345', recursive=False)
observer.start()

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    observer.stop()
observer.join()
```

### Option 4: Bash Script

```bash
#!/bin/bash

NOTIFICATION_FILE="./.crowd/sessions/12345/developer-notifications.jsonl"

# Get initial size
LAST_SIZE=$(stat -f%z "$NOTIFICATION_FILE" 2>/dev/null || stat -c%s "$NOTIFICATION_FILE" 2>/dev/null || echo 0)

# Watch for changes
tail -f "$NOTIFICATION_FILE" | while read -r line; do
  # Parse JSON
  MESSAGE_FROM=$(echo "$line" | jq -r '.from')
  PREVIEW=$(echo "$line" | jq -r '.preview')
  PRIORITY=$(echo "$line" | jq -r '.priority')

  # Display notification
  echo ""
  echo "📬 New message from $MESSAGE_FROM (Priority: $PRIORITY)"
  echo "   $PREVIEW"
  echo ""

  # Optional: Send desktop notification
  if command -v notify-send &> /dev/null; then
    notify-send "Message from $MESSAGE_FROM" "$PREVIEW"
  fi
done
```

## Getting the Notification File Path

The server logs the notification file path on startup. Look for:

```
📬 Developer notification file: /path/to/.crowd/sessions/1234567890/developer-notifications.jsonl
```

You can also construct it from:
- Base directory: `.crowd/sessions` (or `MESSAGE_BASE_DIR` env var)
- Session ID: From server logs or `session.json`
- Filename: `developer-notifications.jsonl`

## Fetching Full Messages

When a notification is received, the CLI should:

1. Display the preview to the user
2. Allow user to click/interact to read full message
3. Call the MCP tool `get_messages()` to fetch full content:

```javascript
const messages = await mcpClient.callTool('get_messages', {
  unreadOnly: true,
  markAsRead: true
});

// Find the message by ID from notification
const fullMessage = messages.find(m => m.id === notification.messageId);
```

## Best Practices

1. **Use native file system events** - Don't poll the file, use `fs.watch`, `chokidar`, or `watchdog`
2. **Track file position** - Only read new content to avoid re-processing old notifications
3. **Handle priority** - Show different UI for `high` priority messages
4. **Graceful degradation** - Handle file not existing yet (server just starting)
5. **Clean shutdown** - Stop file watcher when CLI exits
6. **Error handling** - Handle malformed JSON lines gracefully

## Performance

- File writes are **append-only** - very fast, no file locking
- Notifications are **small** (~200-300 bytes per line)
- File system events are **instant** - no polling delay
- **Zero impact** on MCP protocol communication

## Dual Notification System

The server sends notifications via **both** methods:

1. **File system notifications** (for CLIs that can't use MCP notifications)
2. **MCP protocol notifications** (standard MCP `notifications/message`)

Your CLI can use either or both mechanisms.
