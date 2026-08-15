import { useRef, useState, type DragEvent } from 'react'

export interface FileDropHandlers {
  onDragEnter: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

// Shared drag-and-drop plumbing, extracted from ClientDetail.tsx (the
// original, single-page implementation) so Home.tsx can use the same
// behavior: a dragDepthRef counter so dragenter/dragleave on nested children
// doesn't flicker the overlay, and a guard so non-file drags (e.g. dragging
// selected text) are ignored.
export function useFileDrop(onDropFiles: (files: FileList) => void): {
  isDraggingOver: boolean
  dragHandlers: FileDropHandlers
} {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragDepthRef = useRef(0)

  function onDragEnter(e: DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingOver(true)
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
  }

  function onDragLeave(e: DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingOver(false)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingOver(false)
    if (e.dataTransfer.files.length > 0) onDropFiles(e.dataTransfer.files)
  }

  return { isDraggingOver, dragHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } }
}

// A dropped rater bridge file is identified by extension — the MIME type is
// unreliable for .tt2x (usually empty or application/octet-stream) and a
// dragover event can't inspect file contents before the drop.
export function isRaterFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.tt2x') || name.endsWith('.xml')
}
