# Graph Report - .  (2026-06-30)

## Corpus Check
- Corpus is ~30,710 words - fits in a single context window. You may not need a graph.

## Summary
- 295 nodes · 428 edges · 16 communities (14 shown, 2 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dialogs And UI Components|Dialogs And UI Components]]
- [[_COMMUNITY_Filesystem Storage|Filesystem Storage]]
- [[_COMMUNITY_Canvas Editing|Canvas Editing]]
- [[_COMMUNITY_PWA Shell Assets|PWA Shell Assets]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_App TypeScript Config|App TypeScript Config]]
- [[_COMMUNITY_Attachments Import|Attachments Import]]
- [[_COMMUNITY_Node TypeScript Config|Node TypeScript Config]]
- [[_COMMUNITY_App Routing Entry|App Routing Entry]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_Browser File APIs|Browser File APIs]]
- [[_COMMUNITY_PDF Printouts|PDF Printouts]]
- [[_COMMUNITY_Serena Project Config|Serena Project Config]]
- [[_COMMUNITY_TS Project References|TS Project References]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `Notebook` - 16 edges
3. `compilerOptions` - 14 edges
4. `useAppStore` - 12 edges
5. `Notebook Pen Logo` - 9 edges
6. `cn()` - 8 edges
7. `createEntry()` - 7 edges
8. `scripts` - 6 edges
9. `writeAttachment()` - 6 edges
10. `listPageTree()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Notebook HTML App Shell` --semantically_similar_to--> `Notebook`  [INFERRED] [semantically similar]
  index.html → README.md
- `Notebook Pen Logo` --conceptually_related_to--> `Notebook`  [INFERRED]
  public/logo.svg → README.md
- `Notebook Pen Logo` --references--> `PWA Assets Generator`  [EXTRACTED]
  public/logo.svg → index.html
- `RequireLibrary()` --calls--> `useAppStore`  [INFERRED]
  src/routes/RequireLibrary.tsx → src/store/appStore.ts
- `RequireNotebook()` --calls--> `useAppStore`  [INFERRED]
  src/routes/RequireLibrary.tsx → src/store/appStore.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Notebook PWA Icon Set** — public_logo_notebook_pen_logo, public_apple_touch_icon_180x180_notebook_pen_icon, public_maskable_icon_512x512_maskable_notebook_pen_icon, public_pwa_192x192_pwa_notebook_pen_icon, public_pwa_512x512_pwa_notebook_pen_icon, public_pwa_64x64_pwa_notebook_pen_icon [INFERRED 0.88]
- **Offline Local First Notebook Model** — readme_offline_first_pwa_notebook, readme_local_file_ownership, readme_filesystem_access_api, readme_user_managed_cloud_sync, readme_portable_attachments_folder [EXTRACTED 0.95]
- **PWA Application Surface** — readme_offline_first_pwa_notebook, readme_vite_plugin_pwa, index_html_pwa_mobile_metadata, index_html_pwa_assets_generator, public_logo_notebook_pen_logo [INFERRED 0.82]

## Communities (16 total, 2 thin omitted)

### Community 0 - "Dialogs And UI Components"
Cohesion: 0.07
Nodes (33): ImportChoice, Props, COPY, NewEntryDialog(), NewEntryDialogProps, NewNotebookDialog(), Props, RenameDialog() (+25 more)

### Community 1 - "Filesystem Storage"
Cohesion: 0.09
Nodes (37): copyEntry(), createGroup(), createPage(), createSubfolder(), directoryExists(), diskName(), entryExists(), firstPage() (+29 more)

### Community 2 - "Canvas Editing"
Cohesion: 0.06
Nodes (14): BoxProps, formatCreated(), HANDLES, JustifyDir, LAYER_ACTIONS, PageCanvas(), PdfPage, Props (+6 more)

### Community 3 - "PWA Shell Assets"
Cohesion: 0.08
Nodes (30): Notebook HTML App Shell, PWA Assets Generator, PWA Mobile Metadata, Root Mount Element, /src/main.tsx Entrypoint, Apple Touch Notebook Pen Icon, Designer Maintained Brand Mark, Lucide notebook-pen Icon (+22 more)

### Community 4 - "Runtime Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, class-variance-authority, clsx, @iconify/react, idb-keyval, lucide-react, pdfjs-dist, @radix-ui/react-dialog (+18 more)

### Community 5 - "App TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+14 more)

### Community 6 - "Attachments Import"
Cohesion: 0.17
Nodes (14): attachmentUrl(), deleteAttachment(), getAttachmentsDir(), readAttachment(), sanitizeFilename(), writeAttachment(), imageAspect(), importAttachment() (+6 more)

### Community 7 - "Node TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 8 - "App Routing Entry"
Cohesion: 0.19
Nodes (7): App(), NotebookScreen, paths, RequireLibrary(), RequireNotebook(), LaunchScreen(), supported

### Community 9 - "Dev Dependencies"
Cohesion: 0.18
Nodes (11): devDependencies, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom, typescript, vite (+3 more)

### Community 10 - "Browser File APIs"
Cohesion: 0.25
Nodes (7): DataTransferItem, DirectoryPickerOptions, FileSystemDirectoryHandle, FileSystemEntryHandle, FileSystemHandle, FileSystemHandlePermissionDescriptor, Window

### Community 12 - "Serena Project Config"
Cohesion: 0.33
Nodes (6): FreeCanvas Project, Gitignore Based File Filtering, Language Server Configuration, Local Project Overrides, Read Write Project Mode, Serena Project Config

## Knowledge Gaps
- **138 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+133 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAppStore` connect `Dialogs And UI Components` to `App Routing Entry`, `Filesystem Storage`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Notebook` (e.g. with `Notebook HTML App Shell` and `Notebook Pen Logo`) actually correct?**
  _`Notebook` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `useAppStore` (e.g. with `NewEntryDialog()` and `NewNotebookDialog()`) actually correct?**
  _`useAppStore` has 11 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dialogs And UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07439613526570048 - nodes in this community are weakly interconnected._
- **Should `Filesystem Storage` be split into smaller, more focused modules?**
  _Cohesion score 0.09371980676328502 - nodes in this community are weakly interconnected._
- **Should `Canvas Editing` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._