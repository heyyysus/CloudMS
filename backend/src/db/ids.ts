import { randomBytes } from "node:crypto"
import { sql } from "drizzle-orm"
import { varchar } from "drizzle-orm/pg-core"

// Every row id is 128 bits of randomness rendered as unpadded base64url, so
// no id anywhere in the schema leaks a creation order or a row count.
export const ROW_ID_LENGTH = 22

export const ROW_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

export function generateRowId(): string {
  return randomBytes(16).toString("base64url")
}

// Matches generateRowId() above: gen_random_bytes(16) base64-encodes to 24
// chars (with padding), and translate() both maps the two non-urlsafe
// characters (+/ -> -_) and deletes the padding (=, the third `from` char has
// no matching `to` char) in one pass.
export const ROW_ID_DEFAULT_SQL = sql`translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_')`

// Primary key column every table uses: a DB-side default (so any insert path,
// including raw SQL, always produces a valid id) plus a Drizzle-side default
// (so `.returning()` sees the id before the round-trip).
export function rowIdPk() {
  return varchar("id", { length: ROW_ID_LENGTH }).primaryKey().$defaultFn(generateRowId).default(ROW_ID_DEFAULT_SQL)
}

// Foreign-key / plain id-reference column. No default: these are always
// supplied by the caller (either as a literal or via .references()).
export function rowIdFk(name: string) {
  return varchar(name, { length: ROW_ID_LENGTH })
}
