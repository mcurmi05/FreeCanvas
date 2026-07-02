//shortcut labels show both symbols so they read on every platform:
//"B" -> "⌘/Ctrl+B", shift adds Shift
export function shortcutLabel(key: string, shift = false): string {
  return `⌘/Ctrl+${shift ? 'Shift+' : ''}${key}`
}
