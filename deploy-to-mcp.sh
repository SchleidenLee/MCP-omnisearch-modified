#!/bin/bash
set -e

# 定义源目录和目标目录
SOURCE_DIR="/mnt/x/AI/projects/mcp-omnisearch"
TARGET_DIR="/mnt/x/AI/MCP/mcp-omnisearch"

echo "🚀 Deploying mcp-omnisearch to $TARGET_DIR..."

# 1. 创建目标目录
mkdir -p "$TARGET_DIR"

# 2. 复制小文件（配置文件、启动脚本等）
echo "📄 Copying small files..."
cp "$SOURCE_DIR/start-mcp.sh" "$TARGET_DIR/"
cp "$SOURCE_DIR/.env" "$TARGET_DIR/"
cp "$SOURCE_DIR/package.json" "$TARGET_DIR/"

# 3. 复制编译产物
echo "📦 Copying dist/ directory..."
cp -r "$SOURCE_DIR/dist" "$TARGET_DIR/"

# 4. 复制依赖包（这一步可能较慢）
echo "📦 Copying node_modules/ directory (this may take a while)..."
cp -r "$SOURCE_DIR/node_modules" "$TARGET_DIR/"

# 5. 确保启动脚本可执行
chmod +x "$TARGET_DIR/start-mcp.sh"

echo "✅ Deployment completed successfully!"
echo "📂 Target directory: $TARGET_DIR"
echo "📋 Files deployed:"
ls -lh "$TARGET_DIR/"
