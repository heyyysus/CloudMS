import express, { Application, Request, Response } from "express"

const app: Application = express()
const PORT = process.env.PORT || 8000

app.use(express.json())

app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" })
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

export default app