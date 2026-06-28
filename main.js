const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow;
let forceClose = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a24',
      symbolColor: '#ffffff',
      height: 35
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  
  mainWindow.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:try-close');
  });
  
  // Optional: mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: Open File Dialog
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const filePath = filePaths[0];
  const fileBytes = await fs.readFile(filePath);
  const name = path.basename(filePath);

  return {
    filePath,
    name,
    bytes: fileBytes
  };
});

// IPC: Save File Dialog (Save As)
ipcMain.handle('dialog:saveFile', async (event, { defaultName, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) {
    return null;
  }

  await fs.writeFile(filePath, Buffer.from(data));
  const name = path.basename(filePath);
  
  return { filePath, name };
});

// IPC: Direct Save (Overwrite)
ipcMain.handle('fs:writeFile', async (event, { filePath, data }) => {
  const resolved = path.resolve(filePath);
  const isPdf = resolved.toLowerCase().endsWith('.pdf');
  
  if (!isPdf) {
    throw new Error('Access denied: target file must be a PDF document.');
  }

  await fs.writeFile(resolved, Buffer.from(data));
  return true;
});

// IPC: Get App Version
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

// IPC: Close App
ipcMain.on('app:close', () => {
  forceClose = true;
  if (mainWindow) {
    mainWindow.close();
  }
});
