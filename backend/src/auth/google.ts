import { OAuth2Client } from "google-auth-library"

export interface GoogleIdentity {
  email: string
  sub: string
  name?: string
}

const client = new OAuth2Client()

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audience = process.env.GOOGLE_CLIENT_ID
  if (!audience) {
    throw new Error("GOOGLE_CLIENT_ID is not set")
  }
  const ticket = await client.verifyIdToken({ idToken, audience })
  const payload = ticket.getPayload()
  if (!payload?.email || !payload.email_verified) {
    throw new Error("Google token has no verified email")
  }
  return { email: payload.email, sub: payload.sub, name: payload.name }
}
