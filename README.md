# CTF Platform

React (Vite) frontend, Node 20+ / Express backend, PostgreSQL. Challenge files are stored inside the database, so free hosts with temporary disks are fine.

## Run locally
1. Create a free Postgres database at neon.tech and copy its connection string.
2. `npm install`, then `cp .env.example .env` and fill it in.
   - `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `ADMIN_PASSWORD_HASH`: `npm run hash -- 'YourStrongAdminPassword'`
3. `npm run build` (installs and builds the React client), then `npm start`, open http://localhost:3000.
   For live frontend editing, run `npm run dev` in one terminal and `npm run client` in another, then open http://localhost:5173. Tables are created automatically. A demo challenge uses the flag `CTF{default_flag_here}`.

## Deploy (Render free tier + Neon)
1. Push this folder to a GitHub repo (`.env` is git-ignored).
2. render.com > New > Web Service > connect the repo. Build: `npm install && npm run build`. Start: `npm start`.
3. Add environment variables: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `NODE_ENV=production`.
4. Open the `onrender.com` URL. Redeploy by pushing to GitHub. Free instances sleep after idle time, so open the site a few minutes before the event starts.
5. Do not use Vercel or Netlify for this backend; they have no persistent server.

## During the event (all in the Admin panel, no redeploy)
- Participants > Import: paste or upload the Google Form CSV (see `sample_participants.csv`). Re-import any time.
- Challenges: add, edit, enable/disable, hide, delete, change flags or files. Edits never change existing scores.
- Activity: live solves and every flag submission with IP. Overview: teams, ranks, CSV export.
- Forgotten password: Overview > Reset code, send the code privately to the participant.

## Backup / restore
Neon keeps point-in-time history and lets you create a branch from any moment. For your own copy: `pg_dump "$DATABASE_URL" > backup.sql`, restore with `psql "$DATABASE_URL" < backup.sql`. Also export the CSV from Admin before and after the event.

## Change the admin password after deploy (email code)
- Logged in: Admin > security > Send verification code > enter the 6-digit code from the admin email > new password.
- Forgot or leaked: Admin login > "Forgot admin password?". The code is sent only to `ADMIN_EMAIL`.
- A change signs out every admin session at once and replaces the password stored in the database. The `ADMIN_PASSWORD_HASH` env value is then ignored.
- New password: 12+ characters with upper, lower, number and symbol. Codes expire in 10 minutes, allow 5 tries, and can be requested once a minute.
- Email setup (free): create an account at resend.com using the SAME email as `ADMIN_EMAIL`, create an API key, and set `RESEND_API_KEY` locally and on Render. Without a verified domain, Resend only delivers to your own account email, which is exactly the admin email. Free plan: 100 emails a day.
- Locally, with `RESEND_API_KEY` empty, the code is printed in the server console instead of emailed. In production a missing key shows "Email could not be sent".
- Locked out (no email access): in the Neon SQL editor run `delete from admin_cfg where key='pw_hash';` and the password from `ADMIN_PASSWORD_HASH` works again.

## Remove test participants (admin only)
Admin > overview: tick the teams you want gone and click "Remove selected". This deletes their approved emails, accounts, scores and submissions in one step. A small ✕ next to a member removes just that email and its account (team leaders can only be removed with the whole team). Both actions need the admin login and cannot be done by participants. Importing the CSV again would add them back.
