// BINGO - avvio per Windows e Mac
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'BINGO',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#5ec8ff',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.maximize();
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  // i link esterni si aprono nel browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
