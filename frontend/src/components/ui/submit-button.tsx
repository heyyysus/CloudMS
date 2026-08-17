import * as React from "react"

import { Button } from "@/components/ui/button"
import { isMac } from "@/lib/platform"

// The submit button every form ends with. Wraps the isPending/label ternary
// each form used to repeat, and carries the Cmd/Ctrl+Enter hint so the
// shortcut from useSubmitShortcut is discoverable in the one place the user
// is already looking. The hint hides on small screens (no modifier keys
// there) and while the mutation is in flight, where the label is the news.
function SubmitButton({
  isPending,
  pendingLabel,
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type"> & {
  isPending?: boolean
  pendingLabel?: string
}) {
  return (
    <Button
      type="submit"
      disabled={disabled || isPending}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      {...props}
    >
      {isPending && pendingLabel ? pendingLabel : children}
      {/* aria-hidden so the glyphs stay out of the accessible name - the
          shortcut is announced by aria-keyshortcuts instead, and the button
          keeps being findable by its label alone. */}
      {!isPending && (
        <kbd
          aria-hidden="true"
          className="hidden font-sans text-[10px] font-medium opacity-60 sm:inline"
        >
          {isMac() ? "⌘⏎" : "Ctrl ⏎"}
        </kbd>
      )}
    </Button>
  )
}

export { SubmitButton }
