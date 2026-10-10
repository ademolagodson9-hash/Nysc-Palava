# PALAVA — NYSC Adventure Game

**Serve Your Fatherland. Survive the PALAVA.**

PALAVA is a free, browser-playable Nigerian NYSC life-adventure game inspired by life in Oyo and Osun States. Play through orientation camp, posting to a Place of Primary Assignment (PPA), CDS, accommodation, transport, allowance, side hustles, relationships and your service year.

## Play and install

- **Play online:** https://palava-nysc-adventure.onrender.com/
- **Install on Android/desktop:** open the game in Chrome or Edge and choose **Install app** or **Add to Home Screen**. The title screen also has an install guide.
- **Install on iPhone/iPad:** open the game in Safari, tap **Share**, then **Add to Home Screen**.
- The web app shell can open offline after the game has been loaded once. Account, chat and other server features still need an internet connection.
- **Source code:** https://github.com/ademolagodson9-hash/Nysc-Palava

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

## Important limitations

- PALAVA certificates are game souvenirs, **not official NYSC documents**.
- PPA names in the game are fictional examples, not official NYSC placement vacancies.
- This is an early online prototype. Accounts, sessions, saves, chat and certificates are currently held in server memory and can be lost when the service restarts. Use a persistent database before relying on it for long-term player accounts.
- The community hub is basic chat/player listing. Friends, direct messages, player-to-player transfers and the admin dashboard are not yet fully implemented and should not be treated as working features.

## Deployment

The project is hosted as a Node.js web service on Render and connected to the `main` branch of this GitHub repository. Commits to `main` are intended to trigger automatic deployment.
