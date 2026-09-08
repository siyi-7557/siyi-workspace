/**
 * Demo Mode 启动器
 *
 * 以 demo 模式启动**真实工作台**（同一套 backend/public 前端），
 * 但数据源指向仓库内虚构 Vault（clients/personal-ai/demo/vault），
 * 而非个人 Obsidian。这样 HR 看到的界面与你一致，内容为虚构的 Nova Labs。
 *
 * 用法：npm run demo:app  （端口由 .env 的 PORT 决定，默认 8788）
 */
process.env.APP_MODE = 'demo';
require('../backend/server.js');
