#!/usr/bin/env bash
# OpenKick server — production startup
cd "$(dirname "$0")"

# Load production env
export $(grep -v '^#' .env.production | xargs)

# Ensure data directory exists
mkdir -p data

# Start Node.js server
exec node dist/index.js
