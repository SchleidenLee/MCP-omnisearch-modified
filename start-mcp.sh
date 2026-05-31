#!/bin/bash
# MCP Omnisearch 启动脚本
# 自动加载 .env 文件并启动 MCP 服务器

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from .env file..."
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "Warning: .env file not found. Using environment variables only."
fi

# 启动 MCP 服务器
exec node "$SCRIPT_DIR/dist/index.js"
