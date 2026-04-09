#!/bin/bash
set -e

# Inject API key from secrets file (AUTH-01)
# The secrets file is bind-mounted to /run/secrets/anthropic-api-key at container creation.
# Reading from the file prevents the key from appearing in `docker inspect` Env array.
if [ -f /run/secrets/anthropic-api-key ]; then
  export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic-api-key)
fi

# Set sandbox marker (D-13)
export CLAUDE_SANDBOX=1

exec "$@"
