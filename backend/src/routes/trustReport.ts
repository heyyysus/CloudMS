import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { getTrustReportEntries, getTrustReportSeries, getTrustReportSummary } from "../repositories"
import { firstIssue } from "./helpers"
import { trustRangeQuery, trustReportEntriesQuery } from "./schemas"

export const trustReportRouter = Router()

// Org-wide trust ledger read side: admin-only, bucketed in the org's
// reminder_timezone, as-corrected (reversals and the rows they reverse are
// excluded). See docs/API.md's "Trust reporting" section.
trustReportRouter.get(
  "/trust-report/summary",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = trustRangeQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    res.json(await getTrustReportSummary(req.orgId!, parsed.data.range))
  }
)

trustReportRouter.get(
  "/trust-report/series",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = trustRangeQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    res.json(await getTrustReportSeries(req.orgId!, parsed.data.range))
  }
)

trustReportRouter.get(
  "/trust-report/entries",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = trustReportEntriesQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { range, limit, offset, entryType, itemType, carrierId } = parsed.data
    res.json(
      await getTrustReportEntries(req.orgId!, range, {
        limit,
        offset,
        entryType,
        itemType,
        carrierId,
      })
    )
  }
)
