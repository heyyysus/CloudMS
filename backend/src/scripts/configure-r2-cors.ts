// One-time (rerunnable) provisioning script: sets the CORS policy on the R2
// bucket so the browser can PUT directly to presigned upload URLs and GET
// presigned download URLs. R2 has no CORS policy by default, and unlike a
// same-origin API call this can't be worked around in application code - the
// browser blocks the cross-origin request before it ever reaches R2, per the
// CORS spec. Run with `npm run r2:configure-cors` from backend/, optionally
// passing allowed origins as args to override the defaults below.
/// <reference types="node" />
// ts-node only pulls in ambient @types/node globals (process, console) when
// the entry file transitively imports a local project file; this script has
// only external imports, so it needs the explicit reference above.
import "dotenv/config"
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3"

const DEFAULT_ORIGINS = ["http://localhost:5173", "https://cloudms.app"]

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME must be set"
    )
    process.exit(1)
  }

  const origins = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_ORIGINS

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            // PUT for uploads, GET/HEAD for downloads via presigned URLs.
            AllowedMethods: ["PUT", "GET", "HEAD"],
            // The presigned PUT signs Content-Type as a required header;
            // "*" covers that without needing to enumerate every header the
            // browser or a future client might send.
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  )

  console.log(`R2 CORS policy applied to bucket "${bucket}" for origins: ${origins.join(", ")}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
