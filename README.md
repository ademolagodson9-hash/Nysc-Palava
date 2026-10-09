# PALAVA (multiplayer NYSC life game)

Serve Your Fatherland. Survive the Palava.

Play a Nigerian graduate through NYSC: camp, posting, PPA, CDS, allawee, rent, side hustles, nightlife and endings.
Players sign in with a username, save progress, add friends, chat, send each other money and earn a certificate.
You control everything from `/admin`.

No dependencies. Needs only **Node.js 18+**.

## Run locally
```
ADMIN_PASSWORD=choose-a-strong-password node server.js
```
Game: http://localhost:3000   Admin: http://localhost:3000/admin

If you do not set ADMIN_PASSWORD, a random one is printed in the console on first run.

## Get a public link
This needs a host that runs Node. Netlify Drop and GitHub Pages cannot run the server.

**Render.com (recommended)**
1. Create a GitHub repo and upload the contents of this folder.
2. On Render: New > Blueprint > pick the repo. It reads `render.yaml` (service name `palava`, 1 GB disk, auto-generated admin password).
3. When it finishes you get `https://palava.onrender.com` (or similar). Admin is the same link plus `/admin`.
4. The generated admin password is under the service's Environment tab (ADMIN_PASSWORD).
5. Persistent disks need a paid plan. For a free test, set `plan: free` and remove the disk block; data then resets on each restart.

**Docker / Fly.io / Railway / VPS:** `docker build -t palava . && docker run -p 3000:3000 -v palava-data:/data -e ADMIN_PASSWORD=... palava`

**Instant temporary link from your own computer:** run the server, then in another terminal run
`npx cloudflared tunnel --url http://localhost:3000` (or `npx localtunnel --port 3000`). The link works while your computer is on.

## Game features
- Weekly play: 10 activities per week, 36 weeks (9 months). Allawee and bills arrive every 4th week.
- Free-text course of study (mapped to a career track and starting skills)
- Save: auto-save plus a Save button and "Save and quit" (cloud for signed-in players, device for guests)
- Friends, private messages, global chat, daily cheers, profiles, leaderboard
- Send money to other players (from your bank balance, N100 to N50,000 per transfer, N150,000 per day)
- Certificate of National Service (game edition) with your name, username, course, PPA, grade, state code and a serial number.
  Download as PNG or print. Signed-in players get a serial anyone can verify at `/verify/<serial>`.

## Admin panel (/admin)
Dashboard, players (ban, mute, reset password, give money, edit save, read messages, delete), chat moderation,
money transfer log, live announcements, and live game settings (allawee amount, cost of living, betting, registration,
transfers, maintenance mode, message of the day).

## Notes
- Data is stored in `DATA_DIR/db.json`. Back it up. For thousands of players, move to a real database.
- Passwords are hashed with scrypt, sessions use HttpOnly cookies, API writes need a custom header, login/register/chat/transfers are rate limited, and player text is escaped.
- Game logic runs in the browser, so scores and balances are trust-based. Transfers are checked against the last cloud save and capped, and admins can edit or reset any save.
- Certificates are game souvenirs. They are clearly marked as not official NYSC documents.
