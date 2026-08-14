// Shared by anything that shows a person as a short chip (user menu avatar,
// policy log author chips, ...). Falls back to the email when name is null.
export function initials(person: { name: string | null; email: string }): string {
  const source = person.name ?? person.email
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
