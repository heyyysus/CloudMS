# Vendored skill — do not edit SKILL.md here

`SKILL.md` and `LICENSE` in this directory are copied verbatim from upstream.
Edit them upstream, not here, so the copy stays diffable.

- Source: https://github.com/ayghri/i-have-adhd
- Path upstream: `skills/i-have-adhd/SKILL.md`
- Commit: `839872f9d1cd634fed642b4589ce7226199cc15f` (2026-09-19)
- License: MIT, © 2026 Ayoub Ghriss — see `LICENSE`

## Why it is vendored

The plugin (`i-have-adhd@i-have-adhd`, enabled in `.claude/settings.json`) only
loads where somebody has run `claude plugin install`. CI runners never do, and
the pipeline stages write most of what a person ends up reading. Vendoring puts
the canonical rules in the checkout, so every stage can read them with the
`Read` tool it already has in its allow-list.

## To update

```
curl -fsSL https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md \
  -o .claude/skills/i-have-adhd/SKILL.md
```

Then bump the commit above, re-read `CLAUDE.md`'s "Writing for humans" section
for anything the update contradicts, and commit the two together.
