// Cloudflare R2 (S3-compatible) client for policy attachments. Config is read
// inline from process.env per call (not cached at module load), mirroring
// mailer.ts, so tests can stub it and a missing credential surfaces
// per-request rather than at boot.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { DemoDisabledError, demoMode } from "../demo"

const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60
const DOWNLOAD_URL_EXPIRY_SECONDS = 15 * 60

// Raised when R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME
// aren't set, so the route can map it to a 503 instead of a confusing 500.
export class R2NotConfiguredError extends Error {}

function getClient(): { client: S3Client; bucket: string } {
  if (demoMode()) {
    throw new DemoDisabledError("File storage is disabled in demo mode")
  }

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new R2NotConfiguredError(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME must be set"
    )
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { client, bucket }
}

// Direct server-side upload, as opposed to the presigned-URL flow above
// (which lets the browser PUT straight to R2). Used for files the server
// generates itself, e.g. the policy change form.
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = getClient()
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  )
}

export function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const { client, bucket } = getClient()
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  return getSignedUrl(client, command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS })
}

// ASCII-only `filename=` for older clients, plus an RFC 5987 `filename*=`
// (percent-encoded UTF-8) for everything else, so non-ASCII file names still
// survive; quotes/backslashes are stripped since they'd break the quoted
// `filename=` value.
function contentDispositionHeader(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  const encoded = encodeURIComponent(fileName)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

// `downloadFileName` set forces the browser to save rather than render the
// object - used by the "Download" action in the attachment preview dialog,
// as opposed to the plain inline URL used to preview it.
export function getPresignedDownloadUrl(
  key: string,
  opts?: { downloadFileName?: string }
): Promise<string> {
  const { client, bucket } = getClient()
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(opts?.downloadFileName && {
      ResponseContentDisposition: contentDispositionHeader(opts.downloadFileName),
    }),
  })
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS })
}

export interface ObjectHead {
  sizeBytes: number
  contentType: string | undefined
}

// Returns null if the object doesn't exist (e.g. the client never finished
// the PUT), so the confirm route can respond with a normal 400 instead of
// letting an AWS SDK error surface as a 500.
export async function headObject(key: string): Promise<ObjectHead | null> {
  const { client, bucket } = getClient()
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType }
  } catch (err) {
    if (err instanceof NotFound) return null
    throw err
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
