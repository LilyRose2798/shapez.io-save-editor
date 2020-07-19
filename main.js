const { app, BrowserWindow } = require("electron")

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 900,
        height: 1000,
        webPreferences: {
            nodeIntegration: true
        }
    })
    win.loadFile("index.html")
    win.webContents.openDevTools()
})
