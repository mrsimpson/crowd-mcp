#!/bin/sh
# Debug script to inspect OpenCode installation

echo "=== Checking opencode binary ==="
GLOBAL_BIN="$(npm config get prefix)/bin"
GLOBAL_ROOT="$(npm root -g)"

echo "Global bin: $GLOBAL_BIN"
echo "Global root: $GLOBAL_ROOT"
echo ""

if [ -f "$GLOBAL_BIN/opencode" ]; then
  echo "✓ opencode exists at: $GLOBAL_BIN/opencode"
  ls -la "$GLOBAL_BIN/opencode"
  echo ""

  # Check if it's a symlink
  if [ -L "$GLOBAL_BIN/opencode" ]; then
    SYMLINK_TARGET=$(readlink "$GLOBAL_BIN/opencode")
    echo "It's a symlink pointing to: $SYMLINK_TARGET"

    # Resolve absolute path
    cd "$GLOBAL_BIN"
    ABSOLUTE_TARGET=$(readlink -f "opencode")
    echo "Absolute path: $ABSOLUTE_TARGET"

    # Check if target exists
    if [ -f "$ABSOLUTE_TARGET" ]; then
      echo "✓ Symlink target exists"
      ls -la "$ABSOLUTE_TARGET"
      echo ""
      echo "First lines of target:"
      head -5 "$ABSOLUTE_TARGET"
    else
      echo "✗ ERROR: Symlink target does NOT exist!"
    fi
  fi
else
  echo "✗ ERROR: opencode not found in $GLOBAL_BIN"
fi

echo ""
echo "=== Checking opencode-ai package ==="
if [ -d "$GLOBAL_ROOT/opencode-ai" ]; then
  echo "✓ opencode-ai package exists"
  ls -la "$GLOBAL_ROOT/opencode-ai/"
  echo ""
  echo "Checking bin directory:"
  if [ -d "$GLOBAL_ROOT/opencode-ai/bin" ]; then
    ls -la "$GLOBAL_ROOT/opencode-ai/bin/"
  else
    echo "✗ No bin directory found"
  fi
else
  echo "✗ ERROR: opencode-ai package not found"
fi

echo ""
echo "=== Attempting to execute ==="
if command -v opencode >/dev/null 2>&1; then
  echo "✓ opencode found in PATH"
  opencode --version
else
  echo "✗ opencode not found in PATH"
  exit 1
fi
