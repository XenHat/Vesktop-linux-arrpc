/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";
import { join } from "path";
import { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";
import { Millis } from "shared/utils/millis";

import { State } from "./settings";
import { handle } from "./utils/ipcWrappers";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { loadView } from "./vesktopStatic";

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?(?:\+[a-zA-Z0-9.]+)?$/;
/**
 * On some providers (e.g., when a GitHub release has a non-semver tag like
 * "latest"), electron-updater may feed `semver.lt()` an invalid version string,
 * throwing `TypeError: Invalid Version: latest`.  Catch those silently to avoid
 * spamming the console.
 */
const SEMVER_ERROR_RE = /Invalid Version: /;

let updaterWindow: BrowserWindow | null = null;

autoUpdater.on("update-available", update => {
    if (!SEMVER_RE.test(update.version)) return;
    if (State.store.updater?.ignoredVersion === update.version) return;
    if ((State.store.updater?.snoozeUntil ?? 0) > Date.now()) return;

    openUpdater(update);
});

autoUpdater.on("update-downloaded", () => setTimeout(() => autoUpdater.quitAndInstall(), 100));
autoUpdater.on("download-progress", p =>
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, p.percent)
);
autoUpdater.on("error", err => {
    if (SEMVER_ERROR_RE.test(err.message)) return;
    console.error("Updater error:", err.message);
    updaterWindow?.webContents.send(UpdaterIpcEvents.ERROR, err.message);
});

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.fullChangelog = true;

const isOutdated = autoUpdater
    .checkForUpdates()
    .then(res => Boolean(res?.isUpdateAvailable))
    .catch(() => false);

handle(IpcEvents.UPDATER_IS_OUTDATED, () => isOutdated);
handle(IpcEvents.UPDATER_OPEN, async () => {
    try {
        const res = await autoUpdater.checkForUpdates();
        if (res?.isUpdateAvailable && res.updateInfo) openUpdater(res.updateInfo);
    } catch {}
});

function openUpdater(update: UpdateInfo) {
    updaterWindow = new BrowserWindow({
        title: "Vesktop Updater",
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "updaterPreload.js")
        },
        minHeight: 400,
        minWidth: 750
    });
    makeLinksOpenExternally(updaterWindow);

    handle(UpdaterIpcEvents.GET_DATA, () => ({ update, version: app.getVersion() }));
    handle(UpdaterIpcEvents.INSTALL, async () => {
        await autoUpdater.downloadUpdate();
    });
    handle(UpdaterIpcEvents.SNOOZE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.snoozeUntil = Date.now() + 1 * Millis.DAY;
        updaterWindow?.close();
    });
    handle(UpdaterIpcEvents.IGNORE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.ignoredVersion = update.version;
        updaterWindow?.close();
    });

    updaterWindow.on("closed", () => {
        ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
        ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
        ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
        ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);
        updaterWindow = null;
    });

    loadView(updaterWindow, "updater/index.html");
}
