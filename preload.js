const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName, data) => ipcRenderer.invoke('dialog:saveFile', { defaultName, data }),
  saveFileDirectly: (filePath, data) => ipcRenderer.invoke('fs:writeFile', { filePath, data }),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  onTryClose: (callback) => ipcRenderer.on('app:try-close', callback),
  closeApp: () => ipcRenderer.send('app:close'),
});
