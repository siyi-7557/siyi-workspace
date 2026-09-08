/**
 * Obsidian Local REST API 封装
 * 通过 Obsidian Local REST API 插件与 Obsidian 进行双向通信
 * 同时提供原生 URL scheme 支持（无需插件）
 */
const https = require('https');
const http = require('http');
const config = require('../config');
const path = require('path');

// 忽略自签名证书验证（Obsidian Local REST API 使用自签名证书）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

class ObsidianAPI {
  constructor() {
    this.reloadConfig();
  }

  reloadConfig() {
    const obsidianConfig = config.get('obsidian') || {};
    this.enabled = obsidianConfig.localRestApiEnabled || false;
    this.port = obsidianConfig.localRestApiPort || 27124;
    this.insecurePort = obsidianConfig.localRestApiInsecurePort || 27123;
    this.apiKey = obsidianConfig.localRestApiKey || '';
    this.useInsecure = obsidianConfig.useInsecureHttp || false;
    this.vaultPath = config.get('vaultPath') || '';
  }

  /**
   * 检查 Obsidian Local REST API 是否可用
   */
  async isAvailable() {
    if (!this.enabled || !this.apiKey) return false;
    try {
      const result = await this.request('GET', '/');
      return result && result.success !== false;
    } catch (e) {
      return false;
    }
  }

  /**
   * 基础请求方法
   */
  request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const port = this.useInsecure ? this.insecurePort : this.port;
      const protocol = this.useInsecure ? http : https;
      const options = {
        hostname: 'localhost',
        port,
        path: endpoint,
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: false,
      };

      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`Obsidian API ${res.statusCode}: ${parsed.error || data}`));
            }
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Obsidian API 请求超时'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // ========== 文件操作 ==========

  /**
   * 获取当前活动文件
   */
  async getActiveFile() {
    return this.request('GET', '/active-file');
  }

  /**
   * 打开指定文件
   * @param {string} filePath - 相对于 Vault 根目录的文件路径
   */
  async openFile(filePath) {
    return this.request('POST', '/open', { path: filePath });
  }

  /**
   * 读取文件内容
   * @param {string} filePath - 相对于 Vault 根目录的文件路径
   */
  async readFile(filePath) {
    return this.request('GET', `/vault/${encodeURIComponent(filePath)}`);
  }

  /**
   * 创建/写入文件
   * @param {string} filePath - 相对于 Vault 根目录的文件路径
   * @param {string} content - 文件内容
   */
  async writeFile(filePath, content) {
    return this.request('PUT', `/vault/${encodeURIComponent(filePath)}`, content);
  }

  /**
   * 追加内容到文件
   * @param {string} filePath - 相对于 Vault 根目录的文件路径
   * @param {string} content - 要追加的内容
   */
  async appendFile(filePath, content) {
    return this.request('POST', `/vault/${encodeURIComponent(filePath)}`, content);
  }

  /**
   * 删除文件
   * @param {string} filePath - 相对于 Vault 根目录的文件路径
   */
  async deleteFile(filePath) {
    return this.request('DELETE', `/vault/${encodeURIComponent(filePath)}`);
  }

  // ========== 搜索 ==========

  /**
   * 搜索笔记
   * @param {string} query - 搜索关键词
   */
  async search(query) {
    return this.request('POST', '/search', { query });
  }

  // ========== URL Scheme（无需插件） ==========

  /**
   * 生成 Obsidian 原生 URL scheme 链接
   * 用于在浏览器/其他应用中打开 Obsidian 中的指定笔记
   * @param {string} filePath - 相对于 Vault 根目录的文件路径
   * @param {string} vaultName - Vault 名称（可选，不填则用当前 Vault）
   */
  getObsidianUrl(filePath, vaultName = null) {
    const encodedPath = encodeURIComponent(filePath);
    if (vaultName) {
      return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodedPath}`;
    }
    return `obsidian://open?file=${encodedPath}`;
  }

  /**
   * 获取 Vault 名称（从路径中提取）
   */
  getVaultName() {
    if (!this.vaultPath) return null;
    return path.basename(this.vaultPath);
  }

  /**
   * 将绝对路径转换为相对于 Vault 的路径
   * @param {string} absolutePath - 绝对路径
   */
  toVaultRelativePath(absolutePath) {
    if (!this.vaultPath) return absolutePath;
    const normalized = path.normalize(absolutePath);
    const vaultNormalized = path.normalize(this.vaultPath);
    if (normalized.startsWith(vaultNormalized)) {
      return path.relative(vaultNormalized, normalized).replace(/\\/g, '/');
    }
    return normalized;
  }
}

module.exports = new ObsidianAPI();
