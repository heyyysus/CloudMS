import "dotenv/config"
import { seed } from "./seed/run"

seed()
  .then((counts) => {
    console.log("\n=== Row counts ===")
    console.table(counts)
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
