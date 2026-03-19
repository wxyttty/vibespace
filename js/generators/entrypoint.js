/** entrypoint.js — 容器启动脚本生成器 */

function generateEntrypoint(config) {
  const lines = [];
  const isChina = config.region === 'china';

  lines.push('#!/bin/bash');
  lines.push('set -e');
  lines.push('');

  // DNS (构建阶段 resolv.conf 只读，在运行时配置)
  if (isChina) {
    lines.push('# --- DNS ---');
    lines.push('echo -e "nameserver 1.1.1.1\\nnameserver 114.114.114.114\\nnameserver 119.29.29.29" | tee /etc/resolv.conf > /dev/null');
    lines.push('');
  }

  // 从备份恢复 /root 默认文件 (-n 不覆盖已有)
  lines.push('# --- 恢复 /root 默认文件 ---');
  lines.push('cp -an /root-defaults/root/. /root/ 2>/dev/null || true');
  lines.push('');

  // Git
  lines.push('# --- Git ---');
  lines.push('if [ -n "$GIT_USER_NAME" ]; then');
  lines.push('    git config --global user.name "$GIT_USER_NAME"');
  lines.push('fi');
  lines.push('if [ -n "$GIT_USER_EMAIL" ]; then');
  lines.push('    git config --global user.email "$GIT_USER_EMAIL"');
  lines.push('fi');
  lines.push('');

  // SSH 客户端密钥
  lines.push('# --- SSH 密钥 ---');
  lines.push('if [ -n "$SSH_PRIVATE_KEY" ]; then');
  lines.push('    mkdir -p ~/.ssh && chmod 700 ~/.ssh');
  lines.push('    echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_rsa');
  lines.push('    chmod 600 ~/.ssh/id_rsa');
  lines.push('    if [ -n "$SSH_PUBLIC_KEY" ]; then');
  lines.push('        echo "$SSH_PUBLIC_KEY" > ~/.ssh/id_rsa.pub');
  lines.push('        chmod 644 ~/.ssh/id_rsa.pub');
  lines.push('    fi');
  lines.push('    ssh-keyscan -t rsa github.com gitlab.com gitee.com >> ~/.ssh/known_hosts 2>/dev/null');
  lines.push('    chmod 644 ~/.ssh/known_hosts');
  lines.push('fi');
  lines.push('');

  // SSH 服务端密码
  lines.push('# --- SSH 密码 ---');
  lines.push('echo "root:${ROOT_PASSWORD:-root123}" | chpasswd');
  lines.push('');

  // code-server 认证
  if (config.codeServer) {
    lines.push('# --- code-server 认证 ---');
    lines.push('AUTH_ARGS="--auth none"');
    lines.push('if [ -n "$CS_PASSWORD" ]; then');
    lines.push('    export PASSWORD="$CS_PASSWORD"');
    lines.push('    AUTH_ARGS="--auth password"');
    lines.push('fi');
    lines.push('');
  }

  // Cloudflare Tunnel
  if (config.cfTunnel) {
    const cfUrl = isChina ? DEFAULTS.cloudflared.mirrorUrl : DEFAULTS.cloudflared.url;
    lines.push('# --- Cloudflare Tunnel ---');
    lines.push('if [ -n "$CF_TUNNEL_TOKEN" ]; then');
    lines.push(`    wget -q -O /usr/local/bin/cloudflared "${cfUrl}"`);
    lines.push('    chmod +x /usr/local/bin/cloudflared');
    lines.push('    nohup /usr/local/bin/cloudflared tunnel run --token "$CF_TUNNEL_TOKEN" > /var/log/cloudflared.log 2>&1 &');
    lines.push('fi');
    lines.push('');
  }

  // Vibe 别名
  if (config.vibeCommand && config.vibeCommandText) {
    lines.push('# --- Vibe 快捷命令 ---');
    const escaped = config.vibeCommandText.replace(/'/g, "'\\''");
    lines.push(`echo 'alias vibe="${escaped}"' >> /root/.bashrc`);
    lines.push('');
  }

  // 动态生成 README
  lines.push('# --- README ---');
  lines.push('cat > /workspace/README.md << \'READMEEOF\'');
  lines.push('# Development Environment');
  lines.push('');
  lines.push('## 已安装的工具');
  lines.push('');

  if (config.languages.length) {
    lines.push('### 编程语言');
    config.languages.forEach(langId => {
      const lang = DEFAULTS.languages.find(l => l.id === langId);
      if (lang) lines.push(`- ${lang.label}`);
    });
    lines.push('');
  }

  if (config.aiTools.length) {
    lines.push('### AI 工具');
    config.aiTools.forEach(toolId => {
      const tool = DEFAULTS.aiTools.find(t => t.id === toolId);
      if (tool) lines.push(`- ${tool.label}: ${tool.desc}`);
    });
    lines.push('');

    if (config.aiTools.includes('ccline') && config.aiTools.includes('claude-code')) {
      lines.push('### CCLine 配置');
      lines.push('如需集成到 Claude Code，请在 `~/.claude/settings.json` 中配置：');
      lines.push('```json');
      lines.push('{');
      lines.push('  "statusLine": {');
      lines.push('    "type": "command",');
      lines.push('    "command": "ccline",');
      lines.push('    "padding": 0');
      lines.push('  }');
      lines.push('}');
      lines.push('```');
      lines.push('');
    }
  }

  if (config.vibeCommand) {
    lines.push('### 快捷命令');
    lines.push(`输入 \`vibe\` 即可执行: \`${config.vibeCommandText}\``);
    lines.push('');
  }

  lines.push('## 环境变量');
  lines.push('- `ROOT_PASSWORD`: SSH root 密码 (默认: root123)');
  lines.push('- `GIT_USER_NAME`: Git 用户名');
  lines.push('- `GIT_USER_EMAIL`: Git 邮箱');
  lines.push('- `SSH_PRIVATE_KEY`: SSH 私钥');
  lines.push('- `SSH_PUBLIC_KEY`: SSH 公钥');
  if (config.codeServer) lines.push('- `CS_PASSWORD`: Code-Server 密码 (不设置则免密)');
  if (config.cfTunnel) lines.push('- `CF_TUNNEL_TOKEN`: Cloudflare Tunnel Token');
  lines.push('READMEEOF');
  lines.push('');

  // 启动服务
  lines.push('# --- 启动 ---');
  lines.push('/usr/sbin/sshd');
  lines.push('');
  if (config.codeServer) {
    lines.push('exec code-server --bind-addr 0.0.0.0:8080 $AUTH_ARGS /workspace');
  } else {
    lines.push('exec /usr/sbin/sshd -D');
  }

  return lines.join('\n');
}
