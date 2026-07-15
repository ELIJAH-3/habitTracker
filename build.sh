#!/bin/bash
# Render build script

echo "Starting build..."
echo "JSONBIN_ID is set: ${JSONBIN_ID:+yes}"
echo "JSONBIN_KEY is set: ${JSONBIN_KEY:+yes}"

# If JSONBIN_ID and JSONBIN_KEY are set in Render environment variables, inject them.
# Otherwise, leave them as placeholders (the app will gracefully fall back to localStorage).
# We use ~ as the sed delimiter instead of / because API keys often contain / characters.

if [ -n "$JSONBIN_ID" ]; then
  sed -i "s~%%JSONBIN_ID%%~${JSONBIN_ID}~g" script.js
fi

if [ -n "$JSONBIN_KEY" ]; then
  sed -i "s~%%JSONBIN_KEY%%~${JSONBIN_KEY}~g" script.js
fi

echo "Build complete."
