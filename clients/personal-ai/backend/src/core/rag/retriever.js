// 检索器 - 委托给indexer
const indexer = require('./indexer');

async function search(query, options = {}) {
  return await indexer.search(query, options);
}

module.exports = { search };
