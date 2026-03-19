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

  // Claude MCP Servers
  const mcpServers = (config.claudeMcpServers || []).filter(s => s.name && s.json);
  if (mcpServers.length) {
    lines.push('# --- Claude MCP Servers ---');
    mcpServers.forEach(mcp => {
      const safeName = mcp.name.replace(/'/g, "'\\''");
      const safeJson = mcp.json.replace(/'/g, "'\\''");
      lines.push(`claude mcp add-json -s user '${safeName}' '${safeJson}'`);
    });
    lines.push('');
  }

  // Claude Code 工作流和输出样式
  if (config.aiTools.includes('claude-code')) {
    const workflows = config.claudeWorkflows || [];
    const outputStyle = config.claudeOutputStyle;

    // 输出样式配置
    if (outputStyle) {
      lines.push('# --- Claude Code 输出样式 ---');
      const style = DEFAULTS.claudeOutputStyles.find(s => s.id === outputStyle);
      if (style) {
        lines.push('mkdir -p ~/.claude/output-styles');
        // 自定义样式需要下载模板文件
        if (style.isCustom) {
          const ghProxy = isChina ? DEFAULTS.chinaMirrors.ghProxy : '';
          const styleUrl = `${ghProxy}https://raw.githubusercontent.com/SaladDay/zcf/main/templates/common/output-styles/zh-CN/${style.id}.md`;
          lines.push(`curl -sSL "${styleUrl}" -o ~/.claude/output-styles/${style.id}.md 2>/dev/null || true`);
        }
        // 设置全局默认输出样式
        lines.push(`claude config set outputStyle "${outputStyle}" -g 2>/dev/null || true`);
      }
      lines.push('');
    }

    // 工作流安装
    if (workflows.includes('zcf')) {
      lines.push('# --- Claude Code 工作流 (来自 UfoMiao/zcf) ---');
      lines.push('mkdir -p ~/.claude/commands/zcf');
      lines.push('mkdir -p ~/.claude/agents/zcf');

      const ghProxy = isChina ? DEFAULTS.chinaMirrors.ghProxy : '';
      const baseUrl = `${ghProxy}https://raw.githubusercontent.com/UfoMiao/zcf/main/templates`;

      // ZCF 工作流包含的所有子模块
      const zcfModules = [
        {
          commands: ['init-project.md'],
          agents: ['init-architect.md', 'get-current-datetime.md'],
          category: 'common',
        },
        {
          commands: ['workflow.md'],
          agents: [],
          category: 'sixStep',
        },
        {
          commands: ['feat.md'],
          agents: ['planner.md', 'ui-ux-designer.md'],
          category: 'plan',
        },
        {
          commands: ['git-commit.md', 'git-worktree.md', 'git-rollback.md', 'git-cleanBranches.md'],
          agents: [],
          category: 'git',
        },
        {
          commands: ['bmad-init.md'],
          agents: [],
          category: 'bmad',
        },
      ];

      zcfModules.forEach(mod => {
        // 下载命令文件
        mod.commands.forEach(cmd => {
          let cmdUrl;
          if (mod.category === 'git') {
            cmdUrl = `${baseUrl}/common/workflow/git/zh-CN/${cmd}`;
          } else if (mod.category === 'sixStep') {
            cmdUrl = `${baseUrl}/common/workflow/sixStep/zh-CN/${cmd}`;
          } else {
            cmdUrl = `${baseUrl}/claude-code/zh-CN/workflow/${mod.category}/commands/${cmd}`;
          }
          lines.push(`curl -sSL "${cmdUrl}" -o ~/.claude/commands/zcf/${cmd} 2>/dev/null || true`);
        });

        // 下载 Agent 文件
        if (mod.agents.length > 0) {
          lines.push(`mkdir -p ~/.claude/agents/zcf/${mod.category}`);
          mod.agents.forEach(agent => {
            const agentUrl = `${baseUrl}/claude-code/zh-CN/workflow/${mod.category}/agents/${agent}`;
            lines.push(`curl -sSL "${agentUrl}" -o ~/.claude/agents/zcf/${mod.category}/${agent} 2>/dev/null || true`);
          });
        }
      });

      lines.push('');
    }

    // Claude Code settings.json (CCLine statusLine + 遥测禁用)
    const hasCcline = config.aiTools.includes('ccline');
    const hasTelemetryDisable = config.claudeDisableTelemetry;
    if (hasCcline || hasTelemetryDisable) {
      lines.push('# --- Claude Code settings.json ---');
      lines.push('mkdir -p ~/.claude');
      const settings = {};
      if (hasCcline) {
        settings.statusLine = { type: 'command', command: 'ccline', padding: 0 };
      }
      if (hasTelemetryDisable) {
        settings.env = {
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          DISABLE_AUTOUPDATER: '1',
        };
      }
      const settingsJson = JSON.stringify(settings, null, 2);
      lines.push(`cat > ~/.claude/settings.json << 'SETTINGSEOF'`);
      settingsJson.split('\n').forEach(l => lines.push(l));
      lines.push('SETTINGSEOF');
      lines.push('');
    }
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

    // Claude Code 工作流和输出样式信息
    if (config.aiTools.includes('claude-code')) {
      const workflows = config.claudeWorkflows || [];
      const outputStyle = config.claudeOutputStyle;

      if (workflows.length > 0) {
        lines.push('### Claude Code 工作流');
        workflows.forEach(wfId => {
          const wf = DEFAULTS.claudeWorkflows.find(w => w.id === wfId);
          if (wf) lines.push(`- ${wf.label}: ${wf.desc}`);
        });
        lines.push('');
        lines.push('> 使用方式: 在 Claude Code 中输入 `/zcf:命令名` 调用工作流');
        lines.push('');
      }

      if (outputStyle) {
        const style = DEFAULTS.claudeOutputStyles.find(s => s.id === outputStyle);
        if (style) {
          lines.push('### Claude Code 输出样式');
          lines.push(`- **${style.label}**: ${style.desc}`);
          lines.push('');
        }
      }
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
