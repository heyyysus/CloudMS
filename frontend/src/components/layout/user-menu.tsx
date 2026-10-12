import { useRef } from 'react'
import { ImageUp, LogOut } from 'lucide-react'
import { NavLink } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initials } from '@/lib/initials'
import { avatarUrl, type Role, type User } from '@/api/auth'

interface UserMenuProps {
  user: User
  role: Role | null
  // Called with the file the user picked under "Change photo". The menu
  // stays presentational: the caller resizes, uploads and reports errors.
  onUploadPhoto?: (file: File) => void
}

export function UserMenu({ user, role, onUploadPhoto }: UserMenuProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const src = avatarUrl(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none ring-ring focus-visible:ring-2">
          <Avatar>
            {src && <AvatarImage src={src} alt="" />}
            <AvatarFallback>{initials(user)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{user.name ?? user.email}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="text-xs font-normal text-muted-foreground capitalize">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onUploadPhoto && (
          <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
            <ImageUp /> Change photo
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <NavLink to="/logout">
            <LogOut /> Log out
          </NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
      {onUploadPhoto && (
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose a profile photo"
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Reset so picking the same file again still fires onChange.
            event.target.value = ''
            if (file) onUploadPhoto(file)
          }}
        />
      )}
    </DropdownMenu>
  )
}
