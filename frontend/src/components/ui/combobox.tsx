import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronsUpDownIcon } from "lucide-react"

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  className?: string
  "aria-invalid"?: React.AriaAttributes["aria-invalid"]
}

// Searchable single-select built from Popover + Command. Controlled: `value`
// is the selected option's value ('' for none); selecting the current option
// again clears it.
function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-slot="combobox-trigger"
        id={id}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        role="combobox"
        aria-expanded={open}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          !selected && "text-muted-foreground",
          className
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        data-slot="combobox-content"
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  data-checked={option.value === value}
                  onSelect={() => {
                    onValueChange(option.value === value ? "" : option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
