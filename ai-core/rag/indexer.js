/**
 * RAG Indexer - 索引构建器
 * 
 * 从知识目录构建文档索引，支持 BM25 和向量两种索引。
 * 
 * 从原 build-rag-index.js 和 ai-rag.js buildDocuments() 迁移而来。
 */

const path = require('path');
const fs = require('fs');

class RAGIndexer {
  constructor(options = {}) {
    this.options = options;
    this.rootDir = options.rootDir || path.join(__dirname, '..', '..');
    this.outputFile = options.outputFile || path.join(this.rootDir, 'data', 'rag-index.json');
  }

  /**
   * 从目录构建文档集合
   * @param {string} dir - 知识目录
   * @param {string} visibility - 'public' | 'private'
   */
  buildDocumentsFromDir(dir, visibility) {
    const docs = [];
    if (!fs.existsSync(dir)) return docs;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { metadata, body } = this._parseFrontMatter(content);

      // 支持单文件多文档（按 --- 分割）
      const sections = body.split(/\n---\n/);
      if (sections.length > 1) {
        sections.forEach((section, i) => {
          const titleMatch = section.match(/^#\s+(.+)$/m);
          docs.push({
            id: metadata.id ? `${metadata.id}-${i}` : `${visibility}-${file.replace('.md', '')}-${i}`,
            title: titleMatch ? titleMatch[1] : `${file.replace('.md', '')} - ${i + 1}`,
            visibility: visibility,
            tags: metadata.tags || [],
            content: section.trim(),
            source: filePath,
          });
        });
      } else {
        const titleMatch = body.match(/^#\s+(.+)$/m);
        docs.push({
          id: metadata.id || `${visibility}-${file.replace('.md', '')}`,
          title: metadata.title || titleMatch?.[1] || file.replace('.md', ''),
          visibility: visibility,
          tags: metadata.tags || [],
          content: body.trim(),
          source: filePath,
        });
      }
    }
    return docs;
  }

  /**
   * 构建完整索引
   */
  async buildIndex() {
    const publicDir = path.join(this.rootDir, 'ai-core', 'knowledge', 'public');
    const privateDir = path.join(this.rootDir, 'ai-core', 'knowledge', 'private');

    const publicDocs = this.buildDocumentsFromDir(publicDir, 'public');
    const privateDocs = this.buildDocumentsFromDir(privateDir, 'private');
    const allDocs = [...publicDocs, ...privateDocs];

    const index = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      stats: {
        total: allDocs.length,
        public: publicDocs.length,
        private: privateDocs.length,
      },
      documents: allDocs.map(d => ({
        id: d.id,
        title: d.title,
        visibility: d.visibility,
        tags: d.tags,
        content: d.content,
        source: d.source,
      })),
      embeddings: null, // 预留：向量索引
    };

    // 确保输出目录存在
    const outputDir = path.dirname(this.outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(this.outputFile, JSON.stringify(index, null, 2), 'utf-8');
    console.log(`[RAGIndexer] 索引构建完成：${allDocs.length} 篇文档（public: ${publicDocs.length}, private: ${privateDocs.length}）`);
    return index;
  }

  /**
   * 解析 Markdown front matter
   */
  _parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { metadata: {}, body: content };
    const metadata = {};
    match[1].split('\n').forEach(line => {
      const [key, ...rest] = line.split(':');
      if (key && rest.length) {
        let value = rest.join(':').trim();
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(s => s.trim());
        }
        metadata[key.trim()] = value;
      }
    });
    return { metadata, body: match[2] };
  }
}

module.exports = RAGIndexer;
