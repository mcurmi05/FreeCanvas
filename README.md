# Notebook

An offline first PWA notebook. A OneNote style infinite canvas where you own the files. No login, no backend, no cloud APIs. You pick a local folder via the File System Access API, and if you like, your own cloud client (Google Drive, OneDrive, iCloud, Dropbox) can sync it for you by simply storing your notebook there.

## Stack

- React 18, Vite, TypeScript
- vite-plugin-pwa (manifest and Workbox service worker)
- Zustand for state, idb-keyval for persisting folder handles
- Tailwind CSS v4 with shadcn style components (cva and tailwind-merge), lucide-react icons
- Quill rich text editing for the page toolbar

## Features

- OneNote style page, a normal document on a blank white canvas, click anywhere to drop a floating text box
- Nested pages and page groups, mirrored as subdirectories on disk
- Drag a page onto another in the sidebar to nest it, drop between to reorder, or right click for add/nest/promote/group
- Custom page order persisted per folder, not just alphabetical
- Resizable and collapsible sidebar, editor toolbar is the top bar so the canvas fills the screen
- Opening a notebook lands on its first page
- Quill rich text blocks
- Drop, paste, or import images as floating canvas boxes with select, 8 way resize (corners scale, edges stretch), corner rounding, aspect presets, and crop
- Import any file as an attachment pill (double click to open) or, for PDFs, as a printout that lays every page out as images (with the original file dropped as an attachment centered above the first page) or as a PDF window you scroll and resize freely, with a right click toggle to switch it into a slideshow (arrows or ← → keys step through pages, type a page number to jump, ⌘/Ctrl+scroll to zoom, and a collapsible thumbnail sidebar)
- Right click any text box, image, or PDF window to justify it left (canvas edge) or right (the doc width marker, which it then tracks as you slide the margin), or unjustify
- All imported media is copied into the page's `attachments/` folder so a notebook stays self contained and portable
- Undo/redo for box deletions, files are only erased from disk once a delete can no longer be undone
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
