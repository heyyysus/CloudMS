import { FileIcon, FileTextIcon, ImageIcon, type LucideIcon } from 'lucide-react'

// Splits "quote-2026.pdf" into { base: "quote-2026", ext: ".pdf" }. Shared by
// the upload dialog (which prefills its Name field with the base and
// re-appends the extension on submit) and the attachment list (which shows the
// base only), so both agree on where the extension boundary is. A file with no
// extension keeps an empty ext.
export function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return { base: fileName, ext: '' }
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) }
}

// The stored fileName always carries its extension - it becomes the download
// filename - but the UI shows the bare name and conveys the type with an icon
// instead.
export function stripFileExtension(fileName: string): string {
  return splitFileName(fileName).base
}

export function attachmentIcon(mimeType: string): LucideIcon {
  if (mimeType === 'application/pdf') return FileTextIcon
  if (mimeType.startsWith('image/')) return ImageIcon
  return FileIcon
}
