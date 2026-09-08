/**
 * WebpageAdapter - 公开网页信息源适配器
 * 
 * 用于抓取单个公开网页的内容，适用于没有 RSS 的网站。
 * 第一阶段实现基础的网页标题和正文提取。
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const SourceAdapter = require('./adapter');

class WebpageAdapter extends SourceAdapter {
  constructor(config = {}) {
    super({ ...config, type: 'webpage' });
    this.selectors = config.selectors || {};
  }

  /**
   * 采集网页信息
   * @returns {Promise<Array>} 规范化后的信息项数组（单元素数组）
   */
  async fetch() {
    const html = await this._fetchHTML(this.url);
    const item = this._parseHTML(html);
    return [this.normalize(item)];
  }

  /**
   * 抓取 HTML 内容
   */
  _fetchHTML(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: this.timeout,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this._fetchHTML(new URL(res.headers.location, url).href)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 解析 HTML，提取标题和正文
   */
  _parseHTML(html) {
    // 提取标题
    let title = '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = this._decodeHTML(titleMatch[1]);
    }

    // 提取 meta description
    let description = '';
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    if (descMatch) {
      description = this._decodeHTML(descMatch[1]);
    }

    // 提取正文（简化版：去除 script/style，提取 body 文本）
    let content = description;
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      let body = bodyMatch[1];
      // 去除 script 和 style
      body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
      body = body.replace(/<nav[\s\S]*?<\/nav>/gi, '');
      body = body.replace(/<header[\s\S]*?<\/header>/gi, '');
      body = body.replace(/<footer[\s\S]*?<\/footer>/gi, '');
      // 提取段落
      const paragraphs = body.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
      content = paragraphs
        .map(p => p.replace(/<[^>]+>/g, '').trim())
        .filter(p => p.length > 20)
        .join('\n\n');
    }

    // 提取发布时间
    let pubDate = '';
    const dateMatch = html.match(/<time[^>]*datetime=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']*)["']/i);
    if (dateMatch) {
      pubDate = dateMatch[1];
    }

    // 提取作者
    let author = '';
    const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']*)["']/i);
    if (authorMatch) {
      author = this._decodeHTML(authorMatch[1]);
    }

    return {
      title,
      link: this.url,
      pubDate,
      description,
      content,
      author,
      categories: [],
    };
  }

  /**
   * 解码 HTML 实体
   */
  _decodeHTML(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
}

module.exports = WebpageAdapter;