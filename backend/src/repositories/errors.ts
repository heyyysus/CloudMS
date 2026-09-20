// A write whose parent row exists but belongs to another organization. Handled
// exactly like the foreign-key violation a nonexistent parent id raises, so a
// cross-org id is indistinguishable from a bad one.
export class CrossOrgReferenceError extends Error {}
