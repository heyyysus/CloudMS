# HTTPS via Cloudflare Proxy

How to put the VPC (running the `nginx` + `app` stack from `docker-compose.yml`)
behind Cloudflare's proxy, with HTTPS end-to-end and no caching.

## How it fits together

```
Browser --HTTPS--> Cloudflare (proxy, public cert) --HTTPS--> nginx:443 (origin cert) --HTTP--> app:8000
```

- Cloudflare terminates the public-facing TLS connection using its own certificate — visitors never see the origin's cert.
- Cloudflare re-encrypts and forwards to the VPC over HTTPS, validating the origin cert (`Full (strict)` mode).
- The origin cert is a free Cloudflare **Origin CA** certificate — trusted by Cloudflare, valid for 15 years, no renewal automation needed.
- `certbot` has been removed from `docker-compose.yml` — it's no longer needed since Cloudflare issues and manages the public certificate.

## 1. Add the domain to Cloudflare and enable the proxy

1. Add the site to your Cloudflare account (if not already added) and point its nameservers at Cloudflare.
2. In **DNS**, create an `A` record for your domain (or subdomain, e.g. `api.yourdomain.com`) pointing at the VPC's public IP.
3. Make sure the record's proxy status is **Proxied** (orange cloud). This is what routes traffic through Cloudflare instead of hitting the VPC directly.

## 2. Generate a Cloudflare Origin CA certificate

1. In the Cloudflare dashboard, go to **SSL/TLS → Origin Server**.
2. Click **Create Certificate**.
3. Leave the default options (Cloudflare generates the private key, RSA 2048, 15-year validity). Add your hostname(s) (e.g. `api.yourdomain.com`, or `*.yourdomain.com` to cover subdomains).
4. Cloudflare shows you two blocks of text: **Origin Certificate** and **Private Key**. Copy both now — the private key is only shown once.

## 3. Install the certificate on the VPC

On the server, in the repo root:

```bash
mkdir -p nginx/certs
```

Create the two files (paste the contents Cloudflare gave you):

```bash
nano nginx/certs/cloudflare-origin.pem   # paste the "Origin Certificate" block
nano nginx/certs/cloudflare-origin.key   # paste the "Private Key" block
chmod 600 nginx/certs/cloudflare-origin.key
```

These files are git-ignored (`nginx/certs/` is already in `.gitignore`) — never commit them.

## 4. nginx and docker-compose changes (already done in this branch)

- `nginx/conf.d/default.conf` now has two server blocks:
  - port `80` → redirects to `https://`
  - port `443` → terminates TLS using `nginx/certs/cloudflare-origin.{pem,key}` and proxies to `app:8000`
- `docker-compose.yml`:
  - the `nginx` service mounts `./nginx/certs:/etc/nginx/certs:ro`
  - the `certbot` service has been removed

Pull this branch on the server, then restart the stack:

```bash
git pull
docker compose up -d --build nginx
```

## 5. Set Cloudflare's SSL/TLS mode to Full (strict)

In the dashboard: **SSL/TLS → Overview → Encryption mode → Full (strict)**.

`Full (strict)` requires the origin to present a certificate Cloudflare trusts (the Origin CA cert satisfies this) and validates the hostname — this is what gives you a real HTTPS connection between Cloudflare and the VPC, not just an encrypted-but-unverified tunnel.

## 6. Disable caching

Cloud CMS is an API, not static content, so nothing should be cached.

1. Go to **Caching → Configuration** and set **Caching Level** to **Bypass** — but this only affects Cloudflare's default cache behavior for static-looking paths. For a blanket guarantee, add a Cache Rule instead:
2. Go to **Rules → Cache Rules → Create rule**.
   - Rule name: `Bypass cache (all requests)`
   - When incoming requests match: **All incoming requests** (or restrict to your hostname if the zone has other domains)
   - Then: **Cache eligibility → Bypass cache**
3. Save and deploy the rule.

This ensures every request passes through to the origin untouched.

## 7. Verify

```bash
curl -v https://api.yourdomain.com/
```

Check for:
- A valid certificate chain in the TLS handshake (issued by Cloudflare, since Cloudflare is terminating the public connection).
- Response header `cf-cache-status: DYNAMIC` or `BYPASS` (not `HIT`) confirming no caching.
- Successful response from the API through the full chain.

Also confirm the origin leg is healthy — from the dashboard, **SSL/TLS → Overview** should show no origin errors, and `docker compose logs nginx` on the VPC should show no TLS handshake failures.

## Notes / gotchas

- If Cloudflare shows **Error 526 (Invalid SSL certificate)**, the origin cert/key pair is missing, mismatched, or the encryption mode isn't set to `Full (strict)` yet.
- If Cloudflare shows **Error 521/522 (connection refused/timed out)**, check that port 443 is open on the VPC's firewall/security group and that the `nginx` container is up (`docker compose ps`).
- The Origin CA cert is only trusted by Cloudflare — hitting the VPC's IP directly (bypassing Cloudflare) will show a certificate warning in a browser. That's expected; all real traffic should go through the proxied DNS record.
- Renewal: Origin CA certs are valid for 15 years, so no automated renewal is set up. If you ever need to rotate it, repeat steps 2–3.
