import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import { decodeVin, VinDecodeUpstreamError } from "../vinDecoder"
import { firstIssue } from "./helpers"
import { vinDecodeQuery } from "./schemas"

export const vinDecoderRouter = Router()

// Proxies a VIN lookup to the NHTSA vPIC API (see ../vinDecoder.ts) so the
// browser never calls the vendor directly. A VIN vPIC doesn't recognize is a
// 200 with `isValid: false`, not a 404 - the UI distinguishes "not found" from
// "lookup failed", and any non-2xx would collapse the two.
vinDecoderRouter.get("/vin-decode", requireAuth, async (req: Request, res: Response) => {
  const parsed = vinDecodeQuery.safeParse({ vin: req.query.vin })
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  try {
    res.json(await decodeVin(parsed.data.vin))
  } catch (err) {
    if (err instanceof VinDecodeUpstreamError) {
      req.log.error(err)
      res.status(502).json({ error: "VIN lookup is unavailable" })
      return
    }
    throw err
  }
})
