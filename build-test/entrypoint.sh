#!/bin/bash
set -e

# --- 配置 DNS ---
echo -e "nameserver 1.1.1.1\nnameserver 114.114.114.114\nnameserver 119.29.29.29" | tee /etc/resolv.conf > /dev/null

# --- 合并镜像默认文件到持久化卷 ---
cp -an /root-defaults/root/. /root/ 2>/dev/null || true

# --- Git 配置 ---
if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
fi
if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
fi

# --- SSH 密钥配置（客户端，用于 git 操作）---
if [ -n "$SSH_PRIVATE_KEY" ]; then
    mkdir -p ~/.ssh && chmod 700 ~/.ssh
    echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_rsa
    chmod 600 ~/.ssh/id_rsa
    if [ -n "$SSH_PUBLIC_KEY" ]; then
        echo "$SSH_PUBLIC_KEY" > ~/.ssh/id_rsa.pub
        chmod 644 ~/.ssh/id_rsa.pub
    fi
    ssh-keyscan -t rsa github.com gitlab.com gitee.com >> ~/.ssh/known_hosts 2>/dev/null
    chmod 644 ~/.ssh/known_hosts
fi

# --- SSH 服务端密码 ---
echo "root:${ROOT_PASSWORD:-root123}" | chpasswd

# --- code-server 密码认证 ---
AUTH_ARGS="--auth none"
if [ -n "$CS_PASSWORD" ]; then
    export PASSWORD="$CS_PASSWORD"
    AUTH_ARGS="--auth password"
fi

# --- Cloudflare Tunnel ---
if [ -n "$CF_TUNNEL_TOKEN" ]; then
    wget -q -O /usr/local/bin/cloudflared "https://gh-proxy.org/https://github.com/cloudflare/cloudflared/releases/download/2026.3.0/cloudflared-linux-amd64"
    chmod +x /usr/local/bin/cloudflared
    nohup /usr/local/bin/cloudflared tunnel run --token "$CF_TUNNEL_TOKEN" > /var/log/cloudflared.log 2>&1 &
fi

# --- Vibe 快捷命令 ---
echo 'alias vibe="IS_SANDBOX=1 claude --dangerously-skip-permissions"' >> /root/.bashrc

# --- 写入使用说明 ---
cat > /workspace/README.md << 'READMEEOF'
# Development Environment

## 已安装的工具

### 编程语言
- Go
- C
- Python
- Node.js / npm
- Rust
- C++
- Java

### AI 工具
- Claude Code: Anthropic CLI 开发工具
- CCLine: Claude Code 状态行工具
- CC-Switch: Claude Code 多账户切换工具

### CCLine 配置
如需集成到 Claude Code，请在 `~/.claude/settings.json` 中配置：
```json
{
  "statusLine": {
    "type": "command",
    "command": "ccline",
    "padding": 0
  }
}
```

### 快捷命令
输入 `vibe` 即可执行: `IS_SANDBOX=1 claude --dangerously-skip-permissions`

## 环境变量
- `ROOT_PASSWORD`: SSH root 密码 (默认: root123)
- `GIT_USER_NAME`: Git 用户名
- `GIT_USER_EMAIL`: Git 邮箱
- `SSH_PRIVATE_KEY`: SSH 私钥
- `SSH_PUBLIC_KEY`: SSH 公钥
- `CS_PASSWORD`: Code-Server 密码 (不设置则免密)
- `CF_TUNNEL_TOKEN`: Cloudflare Tunnel Token
READMEEOF

# --- 启动 SSH 服务（后台）---
/usr/sbin/sshd

# --- 启动 code-server（前台）---
exec code-server --bind-addr 0.0.0.0:8080 $AUTH_ARGS /workspace
