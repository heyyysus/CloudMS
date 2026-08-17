import "dotenv/config"
import { seed } from "./seed/run"

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
