// "Lastname, Firstname" — the display order used everywhere a person's name
// appears except a page/dialog/card title (see `clientDisplayName` in
// `api/clients.ts`, which stays "First Last" for that exception).
export function formatNameLastFirst(p: { firstName: string; lastName: string }): string {
  return `${p.lastName}, ${p.firstName}`
}
