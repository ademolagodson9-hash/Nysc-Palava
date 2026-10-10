const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const vm = require('node:vm');

async function main() {
  const html = fs.readFileSync('index.html', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  const onlineJs = fs.readFileSync('online.js', 'utf8');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json/i.test(match[1]) && match[2].trim()) new vm.Script(match[2], { filename: 'index.html inline script' });
  }
  new vm.Script(onlineJs, { filename: 'online.js' });
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

    r = await req('/api/certificate', { headers: { Cookie: cookie } });
    assert.equal(r.status, 200, 'issue certificate');
    const serial = (await json(r)).cert;

    r = await req('/api/verify/' + encodeURIComponent(serial));
    const verified = await json(r);
    assert.equal(verified.valid, true, 'verify certificate API');
    assert.equal(verified.cert.username, username, 'certificate owner');

    r = await req('/verify/' + encodeURIComponent(serial));
    assert.equal(r.status, 200, 'certificate public page');

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

    console.log('PALAVA smoke tests passed: health, auth, save/load, chat, certificate verification, PWA assets, SEO files.');
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
