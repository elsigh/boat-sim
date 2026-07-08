import { app, BrowserWindow, shell } from "electron";
import serve from "electron-serve";

// Serves the static Next.js export (out/) over a custom app:// scheme so the
// simulator runs fully offline inside the packaged app.
const loadURL = serve({ directory: "out" });

function createWindow() {
  const window = new BrowserWindow({
    width: 1512,
    height: 945,
    minWidth: 1100,
    minHeight: 700,
    title: "boatsim",
    backgroundColor: "#07131c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Any external links (boat profile sources, charter pages) open in the
  // user's browser rather than inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  void loadURL(window);

  return window;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
