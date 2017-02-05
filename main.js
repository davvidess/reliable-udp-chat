const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

let mainWindow;

function createWindow () {
  mainWindow = new BrowserWindow({
  	'minHeight': 500, 
  	'minWidth': 450, 
  	height: 500, 
  	width: 600
  });

  mainWindow.loadURL(`file://${__dirname}/index.html`);

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

  mainWindow.on('closed', function () {
    app.quit();
    //mainWindow = null;
  });
  
}

app.on('ready', createWindow);
