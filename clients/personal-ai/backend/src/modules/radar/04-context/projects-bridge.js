/**
 * 04 Context - Projects Bridge
 *
 * 与 Siyi OS Projects 交互的桥接层。
 * 提供当前项目列表，用于 AI 相关性判断和信息关联。
 * 架构位置：04 Context 的子模块之一（Knowledge / Memory / Projects / Preferences）
 */

class ProjectsBridge {
  constructor(options = {}) {
    this.options = options;
    this.projects = options.projects || [];
  }

  async init() {
    console.log('[ProjectsBridge] 初始化完成');
  }

  /**
   * 获取当前项目列表
   * 第一阶段：从配置/偏好中读取，后续可对接 Siyi OS Projects Core
   */
  async getProjects() {
    // 第一阶段：返回预设项目列表
    // 后续可从 Siyi OS Projects Core 或数据库动态获取
    return this.projects.length > 0 ? this.projects : [
      { id: 'siyi-os', name: 'Siyi OS', description: '个人AI操作系统核心' },
      { id: 'personal-ai', name: 'Personal AI 工作台', description: '个人AI辅助工作台' },
      { id: 'meet-siyi', name: 'Meet Siyi', description: '个人网站对外人格' },
    ];
  }

  /**
   * 根据信息项判断相关项目
   * @param {Object} item - 信息项（标题、摘要、标签等）
   * @returns {Array<string>} 相关项目名称列表
   */
  async findRelatedProjects(item) {
    const projects = await this.getProjects();
    const text = `${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`.toLowerCase();

    return projects
      .filter(p => {
        const keywords = [p.name, p.id, ...(p.keywords || [])].map(k => k.toLowerCase());
        return keywords.some(k => text.includes(k));
      })
      .map(p => p.name);
  }
}

module.exports = { ProjectsBridge };