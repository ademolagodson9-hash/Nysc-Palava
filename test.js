const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const vm = require('node:vm');

async function main() {
  const html = fs.readFileSync('index.html', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  const onlineJs = fs.readFileSync('online.js', 'utf8');
  const adventure3d = fs.readFileSync('3d.html', 'utf8');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json/i.test(match[1]) && match[2].trim()) new vm.Script(match[2], { filename: 'index.html inline script' });
  }
  new vm.Script(onlineJs, { filename: 'online.js' });
  const adventureScripts = [...adventure3d.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(script => script.trim());
  assert.ok(adventureScripts.length, '3D adventure inline script exists');
  for (const script of adventureScripts) new vm.Script(script, { filename: '3d.html inline script' });
  assert.match(adventure3d, /showEngineFallback/);
  assert.match(adventure3d, /querySelectorAll\('button\\[data-state\\]'\)\.forEach/);
  assert.match(adventure3d, /querySelectorAll\('button\\[data-mission\\]'\)\.forEach/);
  assert.match(adventure3d, /stateIndex=next;missionIndex=0;character\.position\.set\(0,0,5\);rebuildState\(\)/);
  assert.match(adventure3d, /missionIndex=next;rebuildState\(\)/);
  assert.match(adventure3d, /data-game=\"ludo\"/);
  new vm.Script(fs.readFileSync('server.js', 'utf8'), { filename: 'server.js' });
  assert.match(html, /Oyo Community Development Office/);
  assert.match(html, /Osun TechWorks/);
  assert.match(html, /installPALAVA/);
  assert.ok(manifest.icons.some(icon => icon.src === '/icons/palava-192.svg'));
  assert.ok(fs.existsSync('robots.txt'));
  assert.ok(fs.existsSync('sitemap.xml'));

  const port = 39000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function req(path, options = {}) {
    return fetch(base + path, options);
  }
  async function json(response) {
    return response.json();
  }

  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await req('/api/health');
        if (r.ok) { ready = true; break; }
      } catch (_) {}
      await sleep(100);
    }
    assert.ok(ready, 'server did not become ready: ' + stderr);

    let r = await req('/api/health');
    assert.equal((await json(r)).ok, true, 'health endpoint');

    r = await req('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save: { phase: 'life' }, summary: {} })
    });
    assert.equal(r.status, 401, 'cloud save requires authentication');

    const username = 'test_' + Date.now().toString(36);
    r = await req('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'PALAVA-test-123', displayName: 'Test Player' })
    });
    assert.equal(r.status, 200, 'register');
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie.startsWith('palava_session='), 'session cookie set');

    r = await req('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal((await json(r)).user.username, username, 'authenticated profile');

    r = await req('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        save: { phase: 'life', day: 2 },
        summary: { name: 'Test Player', course: 'Architecture', ppa: 'Arc Studio', city: 'Ibadan', state: 'Oyo', ending: 'Graduate', score: 42 }
      })
    });
    assert.equal(r.status, 200, 'save progress');

    r = await req('/api/save', { headers: { Cookie: cookie } });
    assert.equal((await json(r)).save.phase, 'life', 'load saved progress');

    r = await req('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: 'PALAVA smoke test' })
    });
    assert.equal(r.status, 200, 'send chat message');

    r = await req('/api/chat');
    assert.ok((await json(r)).messages.some(message => message.text === 'PALAVA smoke test'), 'read chat');

    r = await req('/api/multiplayer/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ game: 'ludo' })
    });
    assert.equal(r.status, 201, 'create multiplayer Ludo room');
    const room = (await json(r)).room;
    assert.equal(room.game, 'ludo', 'room game type');
    assert.equal(room.players.length, 1, 'host added to room');

    r = await req('/api/multiplayer/rooms/' + room.id, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200, 'room polling endpoint');
    assert.equal((await json(r)).room.id, room.id, 'room polling returns current room');

    r = await req('/api/multiplayer/rooms/' + room.id, { headers: { Cookie: 'palava_session=invalid' } });
    assert.equal(r.status, 401, 'room polling requires authentication');

    r = await req('/api/multiplayer/rooms/' + room.id + '/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: 'roll: 6; move: 1' })
    });
    assert.equal(r.status, 200, 'submit multiplayer room action');
    assert.ok((await json(r)).room.events.some(event => event.text.includes('roll: 6')), 'room action is shared');

    // Verify a second independent account can join the same room and both accounts see shared actions.
    const username2 = 'test2_' + Date.now().toString(36);
    r = await req('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username2, password: 'PALAVA-test-456', displayName: 'Second Player' })
    });
    assert.equal(r.status, 200, 'register second player');
    const cookie2 = (r.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie2.startsWith('palava_session='), 'second player session cookie set');

    r = await req('/api/multiplayer/rooms/' + room.id + '/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
      body: '{}'
    });
    assert.equal(r.status, 200, 'second player joins room');
    assert.equal((await json(r)).room.players.length, 2, 'room contains both players');

    r = await req('/api/multiplayer/rooms/' + room.id + '/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
      body: JSON.stringify({ text: 'second-player move test' })
    });
    assert.equal(r.status, 200, 'second player submits room action');

    r = await req('/api/multiplayer/rooms/' + room.id, { headers: { Cookie: cookie } });
    const hostRoom = (await json(r)).room;
    assert.ok(hostRoom.players.some(player => player.username === username2), 'host sees second player in room');
    assert.ok(hostRoom.events.some(event => event.text.includes('second-player move test')), 'host sees second player action');
    assert.ok(hostRoom.state.moves.some(move => move.by === username2 && move.text === 'second-player move test'), 'second player move appears in shared room state');

    r = await req('/api/multiplayer/rooms'); 
    assert.ok((await json(r)).rooms.some(item => item.id === room.id), 'list multiplayer rooms');

    r = await req('/api/certificate', { headers: { Cookie: cookie } });
    assert.equal(r.status, 200, 'issue certificate');
    const serial = (await json(r)).cert;

    r = await req('/api/verify/' + encodeURIComponent(serial));
    const verified = await json(r);
    assert.equal(verified.valid, true, 'verify certificate API');
    assert.equal(verified.cert.username, username, 'certificate owner');

    r = await req('/verify/' + encodeURIComponent(serial));
    assert.equal(r.status, 200, 'certificate public page');

    r = await req('/api/account', { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(r.status, 200, 'account deletion');
    r = await req('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal((await json(r)).user, null, 'account deletion clears session');

    r = await req('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(r.status, 200, 'logout');

    r = await req('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal((await json(r)).user, null, 'session invalidated after logout');

    r = await req('/manifest.webmanifest');
    assert.equal(r.status, 200, 'manifest served');
    r = await req('/robots.txt');
    assert.equal(r.status, 200, 'robots served');
    r = await req('/sitemap.xml');
    assert.equal(r.status, 200, 'sitemap served');

    console.log('PALAVA smoke tests passed: health, auth, save/load, chat, multiplayer room polling/moves, certificate verification, account deletion, PWA assets, SEO files.');
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
