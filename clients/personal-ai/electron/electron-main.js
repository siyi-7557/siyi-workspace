const { app, BrowserWindow, Tray, Menu, globalShortcut, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const http = require('http');

// 日志文件路径
const LOG_FILE = path.join(__dirname, 'electron-startup.log');
function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${msg}\n`;
  console.log(msg);
  try { fs.appendFileSync(LOG_FILE, line, 'utf-8'); } catch (e) {}
}
function logError(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] [ERROR] ${msg}\n`;
  console.error(msg);
  try { fs.appendFileSync(LOG_FILE, line, 'utf-8'); } catch (e) {}
}

// Express 服务器进程
let serverProcess = null;
const PORT = 8788;

// 测试某个 node 路径能否正常加载 better-sqlite3
function testNode(nodePath) {
  return new Promise((resolve) => {
    const testCode = "try{require('better-sqlite3');process.exit(0)}catch(e){process.exit(1)}";
    const child = spawn(nodePath, ['-e', testCode], {
      cwd: __dirname,
      stdio: 'ignore',
      timeout: 5000,
    });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

// 查找能正常加载 better-sqlite3 的 node 路径
async function findWorkingNode() {
  const candidates = [];
  // 优先使用标准安装路径的 node（用户自己安装的版本）
  candidates.push('C:\\Program Files\\nodejs\\node.exe');
  candidates.push('C:\\Program Files (x86)\\nodejs\\node.exe');
  // 默认 node
  candidates.push('node');
  // 豆包沙箱中的 node（备选）
  const doubaoBase = path.join(process.env.LOCALAPPDATA || '', 'Doubao', 'User Data', 'sandbox_runtime', 'bases');
  if (fs.existsSync(doubaoBase)) {
    try {
      const dirs = fs.readdirSync(doubaoBase);
      for (const dir of dirs) {
        const nodeExe = path.join(doubaoBase, dir, 'node', 'node.exe');
        if (fs.existsSync(nodeExe)) {
          candidates.push(nodeExe);
        }
      }
    } catch (e) {}
  }

  for (const nodePath of candidates) {
    try {
      log(`测试 Node.js: ${nodePath}`);
      const works = await testNode(nodePath);
      if (works) {
        log(`✓ 找到可用 Node.js: ${nodePath}`);
        return nodePath;
      } else {
        log(`✗ 该 Node.js 无法加载 better-sqlite3`);
      }
    } catch (e) {
      logError(`测试失败: ${e.message}`);
    }
  }
  logError('警告: 未找到能加载better-sqlite3的node，使用默认node');
  return 'node';
}

// 探测 8788 是否已有可用的工作台服务（例如看门狗脚本已启动的实例）
function probeExistingServer(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        let healthy = false;
        try {
          const json = JSON.parse(body);
          healthy = res.statusCode === 200 && json.status === 'ok';
        } catch (e) {
          healthy = res.statusCode === 200;
        }
        resolve(healthy);
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

// 释放 8788 端口的占用进程（替代 bat 里的 cmd 逻辑，避免终端弹窗）
function killPortOccupier() {
  return new Promise((resolve) => {
    log('[Electron] 端口 8788 被占用，尝试释放...');
    const cmd = `netstat -ano | findstr ":${PORT}" | findstr "LISTENING"`;
    exec(cmd, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve();
        return;
      }
      const pids = new Set();
      stdout.split(/\r?\n/).forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && /^\d+$/.test(parts[parts.length - 1])) {
          pids.add(parts[parts.length - 1]);
        }
      });
      if (pids.size === 0) {
        resolve();
        return;
      }
      const killCmd = [...pids].map((pid) => `taskkill /F /PID ${pid}`).join(' & ');
      exec(killCmd, { windowsHide: true }, () => {
        setTimeout(resolve, 1500); // 等待端口完全释放
      });
    });
  });
}

// 启动 Express 服务器（独立 Node.js 进程）
async function startServer() {
  // 先探测 8788 是否已有可用服务，有则直接复用，避免双服务器并存
  if (await probeExistingServer()) {
    log(`[Electron] 检测到 8788 已有运行中的工作台服务，直接复用，跳过自启`);
    return PORT;
  }

  // 端口被占用但没有健康服务时，先释放占用进程，避免 server.js 启动失败
  await killPortOccupier();

  // 清空旧日志后，再输出本次启动的探测结论
  try { fs.writeFileSync(LOG_FILE, '', 'utf-8'); } catch (e) {}
  log('[Electron] 未检测到已有服务，正在启动 Express 服务器...');

  // 查找能正常加载 better-sqlite3 的 node 版本
  const nodePath = await findWorkingNode();

  return new Promise((resolve, reject) => {
    // 用系统 Node.js 启动 server.js（在 backend 目录下）
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverCwd = path.join(__dirname, '..', 'backend');
    serverProcess = spawn(nodePath, [serverPath], {
      cwd: serverCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT) },
    });

    // 转发服务器输出
    serverProcess.stdout.on('data', (data) => {
      log(`[Server] ${data.toString().trim()}`);
    });
    serverProcess.stderr.on('data', (data) => {
      logError(`[Server Error] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      logError(`[Electron] 服务器进程启动失败: ${err.message}`);
      reject(err);
    });

    serverProcess.on('close', (code) => {
      log(`[Electron] 服务器进程退出，代码: ${code}`);
      serverProcess = null;
    });

    // 轮询等待服务器启动
    let attempts = 0;
    let settled = false; // 已 resolve/reject 后停止继续重试
    const maxAttempts = 30; // 最多等 15 秒
    const checkServer = () => {
      if (settled) return;
      attempts++;
      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (settled) return;
        if (res.statusCode === 200) {
          settled = true;
          log(`[Electron] Express 服务器已启动: http://localhost:${PORT}`);
          resolve(PORT);
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      if (settled) return;
      if (attempts < maxAttempts) {
        setTimeout(checkServer, 500);
      } else {
        settled = true;
        reject(new Error('服务器启动超时'));
      }
    };

    // 第一次检查
    setTimeout(checkServer, 1000);
  });
}

// 主窗口
let mainWindow = null;
let tray = null;

// 创建主窗口
function createWindow() {
  const iconPath = path.join(__dirname, '..', 'backend', 'public', 'favicon.ico');
  const windowOptions = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '思意工作台',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
    show: true,
  };
  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // 清空历史磁盘缓存，避免渲染进程加载到旧版前端资源
  mainWindow.webContents.session.clearCache().then(() => {
    // 加载页面
    mainWindow.loadURL(`http://localhost:${PORT}`);
  });

  // 菜单被置空后默认的刷新快捷键也失效了，这里手动捕获 Ctrl+R / F5 触发前端刷新
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const shift = input.shift;
    const key = String(input.key || '').toLowerCase();
    if (key === 'f5' || (ctrl && key === 'r')) {
      event.preventDefault();
      // Ctrl+Shift+R / Ctrl+F5：强制忽略缓存刷新
      if (ctrl && shift) {
        setTimeout(() => mainWindow.webContents.reloadIgnoringCache(), 50);
      } else {
        setTimeout(() => mainWindow.webContents.reload(), 50);
      }
    }
  });

  // 首屏加载完成后强制忽略缓存重载一次，确保拿到最新 CSS/JS
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow.__forceReloaded) {
      mainWindow.__forceReloaded = true;
      setTimeout(() => mainWindow.webContents.reloadIgnoringCache(), 80);
    }
  });

  // 页面加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 关闭时最小化到托盘
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      showNotification('思意工作台', '已最小化到系统托盘，点击托盘图标恢复');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建系统托盘
function createTray() {
  const iconPath = path.join(__dirname, '..', 'backend', 'public', 'favicon.ico');
  if (fs.existsSync(iconPath)) {
    tray = new Tray(iconPath);
  } else {
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: '全局搜索 (Ctrl+Shift+Space)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('global-search');
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('思意工作台');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

// 注册全局快捷键
function registerGlobalShortcuts() {
  globalShortcut.register('Control+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('global-search');
    } else {
      createWindow();
    }
  });
  console.log('[Electron] 全局快捷键已注册: Ctrl+Shift+Space');
}

// 显示原生通知
function showNotification(title, body) {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.show();
  }
}

// IPC 通信
ipcMain.on('show-notification', (event, { title, body }) => {
  showNotification(title, body);
});

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

// App 就绪
app.whenReady().then(async () => {
  log('[Electron] 应用启动中...');

  try {
    await startServer();
  } catch (err) {
    logError(`[Electron] 服务器启动失败: ${err.message}`);
    showNotification('思意工作台', `服务器启动失败！日志文件: ${LOG_FILE}`);
    // 自动打开日志文件
    try { spawn('notepad.exe', [LOG_FILE], { detached: true }); } catch (e) {}
  }

  try {
    // 彻底移除菜单栏（autoHideMenuBar 只是默认隐藏，按 Alt 仍会弹出；置空应用菜单可完全去掉）
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    registerGlobalShortcuts();
    log('[Electron] 应用启动完成');
  } catch (err) {
    logError(`[Electron] 窗口创建失败: ${err.message}`);
  }
}).catch(err => {
  logError(`[Electron] 应用启动异常: ${err.message}`);
});

app.on('window-all-closed', () => {
  // 不退出，保持托盘运行
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 退出前清理
app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  // 关闭服务器进程
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
