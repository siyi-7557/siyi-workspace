/**
 * RSSAdapter - RSS/Atom 信息源适配器
 * 
 * 支持 RSS 2.0 和 Atom 格式的信息源。
 * 使用 Node.js 内置 https 模块，不引入额外依赖。
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const SourceAdapter = require('./adapter');

class RSSAdapter extends SourceAdapter {
  constructor(config = {}) {
    super({ ...config, type: 'rss' });
  }

  /**
   * 采集 RSS 信息
   * @returns {Promise<Array>} 规范化后的信息项数组
   */
  async fetch() {
    const xml = await this._fetchXML(this.url);
    const items = this._parseXML(xml);
    return items.map(item => this.normalize(item));
  }

  /**
   * 抓取 XML 内容
   */
  _fetchXML(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(url, {
        headers: {
          // 使用标准浏览器 UA，避免 GitHub Trending 等站点对自定义 UA 返回 406
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        },
        timeout: this.timeout,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // 跟随重定向
          return this._fetchXML(new URL(res.headers.location, url).href)
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
   * 解析 XML（RSS 2.0 / Atom）
   * 不引入 XML 解析库，使用正则提取关键信息
   */
  _parseXML(xml) {
    const items = [];

    // RSS 2.0: <item>...</item>
    const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi);
    if (rssItems) {
      for (const itemXML of rssItems) {
        items.push({
          title: this._extractTag(itemXML, 'title'),
          link: this._extractTag(itemXML, 'link') || this._extractAttr(itemXML, 'link', 'href'),
          pubDate: this._extractTag(itemXML, 'pubDate') || this._extractTag(itemXML, 'date'),
          description: this._extractTag(itemXML, 'description') || this._extractTag(itemXML, 'content:encoded'),
          author: this._extractTag(itemXML, 'author') || this._extractTag(itemXML, 'dc:creator'),
          categories: this._extractTags(itemXML, 'category'),
        });
      }
    }

    // Atom: <entry>...</entry>
    const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi);
    if (atomEntries) {
      for (const entryXML of atomEntries) {
        items.push({
          title: this._extractTag(entryXML, 'title'),
          link: this._extractAttr(entryXML, 'link', 'href'),
          pubDate: this._extractTag(entryXML, 'published') || this._extractTag(entryXML, 'updated'),
          description: this._extractTag(entryXML, 'summary') || this._extractTag(entryXML, 'content'),
          author: this._extractTag(entryXML, 'name'),
          categories: this._extractAttrs(entryXML, 'category', 'term'),
        });
      }
    }

    return items;
  }

  /**
   * 提取 XML 标签内容
   */
  _extractTag(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = xml.match(regex);
    if (!match) return '';
    return this._decodeHTML(match[1].trim());
  }

  /**
   * 提取 XML 标签属性
   */
  _extractAttr(xml, tag, attr) {
    const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : '';
  }

  /**
   * 提取多个标签内容
   */
  _extractTags(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const matches = xml.match(regex) || [];
    return matches.map(m => {
      const inner = m.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return inner ? this._decodeHTML(inner[1].trim()) : '';
    }).filter(Boolean);
  }

  /**
   * 提取多个标签属性
   */
  _extractAttrs(xml, tag, attr) {
    const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, 'gi');
    const matches = xml.match(regex) || [];
    return matches.map(m => {
      const inner = m.match(new RegExp(`${attr}=["']([^"']*)["']`, 'i'));
      return inner ? inner[1] : '';
    }).filter(Boolean);
  }

  /**
   * 解码 HTML 实体
   */
  _decodeHTML(text) {
    const named = {
      rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D',
      nbsp: ' ', hellip: '\u2026', endash: '\u2013', emdash: '\u2014',
      middot: '\u00B7', copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
      laquo: '\u00AB', raquo: '\u00BB', apos: "'",
    };
    return text
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      // 十六进制数字实体 &#x2019;
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
        try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
      })
      // 十进制数字实体 &#8217;
      .replace(/&#(\d+);/g, (_, d) => {
        try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; }
      })
      // 常见命名实体
      .replace(/&([a-zA-Z]+);/g, (m, e) => named[e.toLowerCase()] || m)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, '') // 去除 HTML 标签
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = RSSAdapter;