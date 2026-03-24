# Agro Pluse Deployment Checklist (Render)

## 1) Pre-deploy local checks

Run these from project root:

```powershell
npm run verify
```

Expected result:
- Syntax check passes
- Startup check reports `Result: PASS`

## 2) Render service settings

Use values in `render.yaml` and confirm these in Render dashboard:
- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Auto deploy: enabled (optional)

Disk:
- Name: `agro-data`
- Mount path: `/opt/render/project/src/data`

## 3) Required environment variables

Set these in Render dashboard Environment:

- `NODE_ENV=production`
- `SESSION_SECRET=<strong random 32+ chars>`
- `DATABASE_PATH=/opt/render/project/src/data/users.db`
- `ADMIN_USERNAME=<unique username>`
- `ADMIN_PASSWORD=<strong password>`
- `PAYSTACK_SECRET_KEY=<sk_test... or sk_live...>`
- `PAYSTACK_PUBLIC_KEY=<pk_test... or pk_live...>`

Recommended:
- `CHAT_ENCRYPTION_KEY=<different strong 32+ chars>`
- `BCRYPT_ROUNDS=12`
- `SESSION_DB_NAME=sessions.db`

Optional (email notifications):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `FROM_EMAIL`

## 4) Post-deploy smoke tests

### Health check
Open:
- `https://<your-render-domain>/health`

Expected: JSON with `"status":"healthy"`.

### Admin auth check
Open:
- `https://<your-render-domain>/admin`

Expected:
- Browser prompts for basic auth
- Correct credentials load admin page
- Wrong credentials return unauthorized

### App flow check
- Create test account
- Login succeeds
- Create test deposit
- Confirm entry appears in dashboard/admin

## 5) Payment and withdrawal validation

Manual provider checks (required):
- Confirm Paystack webhook URL is configured to your deployed domain:
  - `https://<your-render-domain>/api/payment/webhook`
- Perform one real end-to-end test in selected mode (test/live):
  - initiate payment
  - verify webhook confirmation
  - submit withdrawal request
  - approve withdrawal from admin

## 6) Operations checklist

- Rotate secrets if previously shared
- Keep only latest required env vars in dashboard
- Back up `/opt/render/project/src/data/users.db` regularly
- Review `logs/security.log` and server logs after each deploy

## 7) Fast rollback plan

If deploy is unhealthy:
- Revert to last working commit
- Redeploy
- Re-check `/health`
- Validate `SESSION_SECRET`, admin creds, and `DATABASE_PATH`
