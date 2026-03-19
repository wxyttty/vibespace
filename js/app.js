/** app.js — Alpine.js 主应用状态 */

function appState() {
  return {
    currentStep: 1,
    totalSteps: 7,
    steps: [
      { num: 1, title: '宿主机地区', icon: '🌏' },
      { num: 2, title: '基础镜像', icon: '📦' },
      { num: 3, title: 'Code-Server', icon: '💻' },
      { num: 4, title: '编程语言', icon: '🛠️' },
      { num: 5, title: 'AI 工具', icon: '🤖' },
      { num: 6, title: '其他工具', icon: '🔧' },
      { num: 7, title: '自定义层', icon: '📝' },
    ],
    outputTab: 'dockerfile',

    /* 配置状态 */
    region: 'china',
    baseImage: 'ubuntu:24.04',
    codeServer: true,
    extensions: DEFAULTS.codeServerExtensions.filter(e => e.checked).map(e => e.id),
    customExtensions: '',
    languages: [],
    languageVersions: {},
    pythonVenv: true,
    aiTools: [],
    aiToolVersions: {},
    cfTunnel: false,
    cfToken: '',
    vibeCommand: false,
    vibeCommandText: DEFAULTS.vibeDefaultCommand,
    volumeMode: 'named',
    customDockerfile: '',
    currentPreset: '',

    /* 生成结果 */
    generatedDockerfile: '',
    generatedEntrypoint: '',
    generatedCompose: '',
    generatedDeploy: '',

    /** 初始化：加载默认预设，监听配置变更自动重新生成 */
    init() {
      this.applyPreset('default');
      const watched = [
        'region', 'baseImage', 'codeServer', 'extensions', 'customExtensions',
        'languages', 'languageVersions', 'pythonVenv',
        'aiTools', 'aiToolVersions',
        'cfTunnel', 'cfToken', 'vibeCommand', 'vibeCommandText',
        'volumeMode', 'customDockerfile',
      ];
      watched.forEach(key => this.$watch(key, () => this.generate()));
    },

    /* 步骤导航 */
    goToStep(step) { if (step >= 1 && step <= this.totalSteps) this.currentStep = step; },
    nextStep() { if (this.currentStep < this.totalSteps) this.currentStep++; },
    prevStep() { if (this.currentStep > 1) this.currentStep--; },

    isStepCompleted(step) {
      if (step === 1) return !!this.region;
      if (step === 2) return !!this.baseImage;
      return true; // 步骤 3-7 无必填项
    },

    /* 多选 toggle 系列 */
    toggleLanguage(langId) {
      const idx = this.languages.indexOf(langId);
      if (idx >= 0) {
        this.languages.splice(idx, 1);
      } else {
        this.languages.push(langId);
        // 首次选中时填入默认版本
        const lang = DEFAULTS.languages.find(l => l.id === langId);
        if (lang && lang.hasVersion && !this.languageVersions[langId]) {
          this.languageVersions[langId] = lang.defaultVersion;
        }
      }
    },
    hasLanguage(langId) { return this.languages.includes(langId); },

    toggleExtension(extId) {
      const idx = this.extensions.indexOf(extId);
      idx >= 0 ? this.extensions.splice(idx, 1) : this.extensions.push(extId);
    },
    hasExtension(extId) { return this.extensions.includes(extId); },

    toggleAiTool(toolId) {
      const idx = this.aiTools.indexOf(toolId);
      idx >= 0 ? this.aiTools.splice(idx, 1) : this.aiTools.push(toolId);
    },
    hasAiTool(toolId) { return this.aiTools.includes(toolId); },

    /** AI 工具依赖 Node.js */
    needsNodejs() {
      return this.aiTools.length > 0 || this.languages.includes('nodejs');
    },

    /** 汇总所有语言所需的 apt 包 */
    getAptPackages() {
      const pkgs = new Set(['git', 'wget', 'unzip', 'curl', 'ca-certificates', 'openssh-server', 'openssh-client']);
      this.languages.forEach(langId => {
        const lang = DEFAULTS.languages.find(l => l.id === langId);
        if (lang) lang.aptPkgs.forEach(p => pkgs.add(p));
      });
      return [...pkgs];
    },

    /** 应用预设：深拷贝配置并触发生成 */
    applyPreset(presetId) {
      const p = DEFAULTS.presets[presetId];
      if (!p) return;
      this.currentPreset = presetId;
      this.region = p.region;
      this.baseImage = p.baseImage;
      this.codeServer = p.codeServer;
      this.extensions = [...p.extensions];
      this.customExtensions = p.customExtensions;
      this.languages = [...p.languages];
      this.languageVersions = { ...p.languageVersions };
      this.pythonVenv = p.pythonVenv;
      this.aiTools = [...p.aiTools];
      this.aiToolVersions = { ...p.aiToolVersions };
      this.cfTunnel = p.cfTunnel;
      this.cfToken = p.cfToken;
      this.vibeCommand = p.vibeCommand;
      this.vibeCommandText = p.vibeCommandText;
      this.volumeMode = p.volumeMode || 'named';
      this.customDockerfile = p.customDockerfile || '';
      this.generate();
    },

    /** 调用三个生成器，刷新语法高亮 */
    generate() {
      const config = this.getConfig();
      this.generatedDockerfile = generateDockerfile(config);
      this.generatedEntrypoint = generateEntrypoint(config);
      this.generatedCompose = generateCompose(config);
      this.generatedDeploy = generateDeploy(config);
      this.$nextTick(() => highlightAll());
    },

    /** 收集当前 UI 状态为生成器配置对象 */
    getConfig() {
      return {
        region: this.region, baseImage: this.baseImage,
        codeServer: this.codeServer, extensions: this.extensions, customExtensions: this.customExtensions,
        languages: this.languages, languageVersions: this.languageVersions, pythonVenv: this.pythonVenv,
        aiTools: this.aiTools, aiToolVersions: this.aiToolVersions,
        cfTunnel: this.cfTunnel, cfToken: this.cfToken,
        vibeCommand: this.vibeCommand, vibeCommandText: this.vibeCommandText,
        volumeMode: this.volumeMode,
        customDockerfile: this.customDockerfile,
        needsNodejs: this.needsNodejs(),
      };
    },

    /** 复制文本到剪贴板，附带按钮反馈 */
    async copyToClipboard(text, btnId) {
      try {
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.classList.add('copied');
          btn.textContent = '已复制!';
          setTimeout(() => { btn.classList.remove('copied'); btn.textContent = '复制'; }, 2000);
        }
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    },

    downloadFile(filename, content) { downloadSingleFile(filename, content); },

    async downloadAllZip() {
      await downloadAllAsZip({
        'Dockerfile': this.generatedDockerfile,
        'entrypoint.sh': this.generatedEntrypoint,
        'docker-compose.yml': this.generatedCompose,
        'deploy.sh': this.generatedDeploy,
      });
    },
  };
}
