// Every other script here pulls Node's globals in transitively through a
// package import; this one imports nothing but a builtin, so ts-node needs
// telling where `process` and `Buffer` come from.
/// <reference types="node" />
import { spawn } from "node:child_process"

// Wrapper around `drizzle-kit push --force` for the container boot (see
// Dockerfile CMD), because push cannot be trusted to report its own failure.
//
// When push hits a prompt it cannot show - pgSuggestions asks before adding a
// unique constraint to a populated table, ahead of any --force check, and a
// container has no TTY - it prints the error and still exits 0. The CMD
// chains on &&, so that swallowed failure boots the server against a schema
// push never applied: a missing column surfaces as a query error at runtime,
// and a missing constraint surfaces as nothing at all until duplicate rows
// have already been written.
//
// ensureUniqueConstraints.ts removes the one prompt that triggers this today.
// This guard is what keeps the next one from booting a half-migrated server:
// rather than matching on error text, it requires push to have printed one of
// its two success lines, and fails the boot if it did not.
const SUCCESS = /Changes applied|No changes detected/

// push draws progress with ANSI escapes; strip them before matching.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

function main() {
  const child = spawn("npx", ["drizzle-kit", "push", "--force"], {
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString()
    process.stdout.write(chunk)
  })
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString()
    process.stderr.write(chunk)
  })

  child.on("error", (err) => {
    console.error("Could not run drizzle-kit push:", err)
    process.exit(1)
  })

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`drizzle-kit push exited with ${code}`)
      process.exit(1)
    }
    if (!SUCCESS.test(output.replace(ANSI, ""))) {
      console.error(
        "drizzle-kit push exited 0 without applying the schema - it printed neither " +
          '"Changes applied" nor "No changes detected". The output above says why; a ' +
          "prompt it could not show on a container's missing TTY is the usual cause. " +
          "Refusing to start the server against a schema that was never pushed."
      )
      process.exit(1)
    }
    process.exit(0)
  })
}

main()
