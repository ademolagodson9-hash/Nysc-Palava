# PALAVA — NYSC Adventure Game

**Serve Your Fatherland. Survive the PALAVA.**

PALAVA is a free, browser-playable Nigerian NYSC life-adventure game inspired by life in Oyo and Osun States. Play through orientation camp, posting to a Place of Primary Assignment (PPA), CDS, accommodation, transport, allowance, side hustles, relationships and your service year.

## Play and install

- **Play online:** https://palava-nysc-adventure.onrender.com/
- **Install on Android/desktop:** open the game in Chrome or Edge and choose **Install app** or **Add to Home Screen**. The title screen also has an install guide.
- **Install on iPhone/iPad:** open the game in Safari, tap **Share**, then **Add to Home Screen**.
- The web app shell can open offline after the game has been loaded once. Account, chat and other server features still need an internet connection.
- **Source code:** https://github.com/ademolagodson9-hash/Nysc-Palava
- **Privacy policy:** https://palava-nysc-adventure.onrender.com/privacy-policy.html
- **Account deletion:** https://palava-nysc-adventure.onrender.com/account-deletion.html
- **Terms:** https://palava-nysc-adventure.onrender.com/terms.html
- **Android build pipeline:** GitHub Actions can build a test APK and, once signing secrets are configured, a signed Play Store bundle. See `PLAY_STORE_LISTING.md`.

## Current gameplay

- Story mode from call-up through camp, posting, PPA work, CDS and the final service-year chapters.
- Randomized fictional PPA placements across Oyo and Osun, including schools, architectural firms, government offices, hospitals, ICT companies, NGOs, media, agriculture, engineering and business placements.
- Skills, reputation, money, allowance, bills, weather, side hustles, local exploration and multiple endings.
- Guest play and account registration/sign-in.
- Basic online community hub with registered-player listing and global chat.
- Game certificate souvenir and certificate verification page.

## Automated checks

Run:

```bash
npm install
npm test
npm start
```

The smoke test checks JavaScript syntax, health, account registration, sign-in state, cloud save/load, community chat, certificate verification, the web-app manifest, install icons, sitemap and crawler rules.

## Persistence configuration

The server now supports PostgreSQL-backed state snapshots. Install dependencies with `npm install`, then set `DATABASE_URL` on the hosting service to the database's **internal** connection URL (keep it secret; never commit it). The app creates its `palava_state` table on startup, restores accounts, sessions, saves, chat, wallet ledger, certificates and multiplayer room state, and writes updated snapshots after mutations. If `DATABASE_URL` is absent, it intentionally runs in memory-only development mode and logs a warning. A database connection or schema failure prevents startup rather than silently pretending persistence is active.

For Render, copy the Internal Database URL from the PostgreSQL database's Connect page into the web service's environment variables as `DATABASE_URL`. Do not paste credentials into source control or chat. After setting it, redeploy and verify the startup log says `PALAVA PostgreSQL persistence ready.`

## Important limitations

- PALAVA certificates are game souvenirs, **not official NYSC documents**.
- PPA names in the game are fictional examples, not official NYSC placement vacancies.
- PostgreSQL persistence is implemented but is only active when `DATABASE_URL` is configured and the service can connect. Without it, accounts and game state remain in memory.
- Multiplayer currently synchronizes room membership and action/event feeds through HTTP polling; the game boards are not yet authoritative, synchronized game engines. It is not ranked/competitive multiplayer.
- Chess is a practice board and does not enforce full legal chess rules. Mini-games remain prototypes and need device-level gameplay validation before release.

## Deployment

The project is hosted as a Node.js web service on Render and connected to the `main` branch of this GitHub repository. Commits to `main` are intended to trigger automatic deployment.
