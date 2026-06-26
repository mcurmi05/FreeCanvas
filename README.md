# Notebook

An offline first PWA notebook. A OneNote style infinite canvas where you own the files. No login, no backend, no cloud APIs. You pick a local folder via the File System Access API, and if you like, your own cloud client (Google Drive, OneDrive, iCloud, Dropbox) can sync it for you by simply storing your notebook there.

## Stack

- React 18, Vite, TypeScript
- vite-plugin-pwa (manifest and Workbox service worker)
- Zustand for state, idb-keyval for persisting folder handles
- Tailwind CSS v4 with shadcn style components (cva and tailwind-merge), lucide-react icons

## Features

- Infinite canvas with pan and zoom
- TipTap rich text blocks
- Freehand ink drawing (perfect-freehand) via the Pointer Events API
- Open `.nbook` files (a zip bundle) straight from your own folder
- Installable PWA that works fully offline
- Your notes never leave your device unless your own cloud client syncs the folder

## Getting started

1. Open the app and click Open notebook folder.
2. Pick a folder on your computer. This is where your notebooks live.
3. Point your cloud client (Google Drive, OneDrive, iCloud, Dropbox) at that same folder if you want it synced across devices.

Recently opened folders are remembered, so you can jump back in with one click.

## Browser support

Folder access uses the File System Access API, currently supported in Chromium browsers (Chrome, Edge, and similar). Other browsers will show an unsupported notice.
