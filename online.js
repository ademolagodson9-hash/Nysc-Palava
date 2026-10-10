/* PALAVA account bridge. The core story is playable as a guest; account APIs are an MVP. */
(() => {
  async function request(path, method='GET', body) {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json','X-Requested-With':'palava'},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  window.authScreen = async function authScreen() {
    const register = confirm('Create a new PALAVA account?\n\nChoose OK to register, or Cancel to sign in.');
    const username = (prompt('Choose a username (3–20 letters, numbers or underscores):') || '').trim().toLowerCase();
    if (!username) return;
    const password = prompt('Password (at least 8 characters):') || '';
    if (!password) return;
    try {
      const result = await request(register ? '/api/auth/register' : '/api/auth/login', 'POST', {username,password,displayName:username});
      if (typeof ME !== 'undefined') ME = result.user;
      if (typeof toast === 'function') toast('Welcome to PALAVA, ' + result.user.username + '!');
      if (typeof title === 'function') title();
    } catch (error) {
      alert(error.message);
    }
  };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.hub = async function hub() {
    const ph = document.querySelector('#ph');
    if (!ph) return;
    ph.innerHTML = '<div class="ph"><div><h2 style="color:#F4B400">PALAVA Online Hub</h2><p>Loading players and community chat…</p><button class="btn" onclick="closePh()">Close</button></div></div>';
    try {
      const [status, chatData] = await Promise.all([request('/api/online/players'), request('/api/chat')]);
      const players = (status.players || []).map(p => '<div class="m">🟢 <b>' + esc(p.displayName || p.username) + '</b> <small>@' + esc(p.username) + '</small></div>').join('') || '<p>No registered players yet.</p>';
      const messages = (chatData.messages || []).slice(-60).map(m => '<div class="m"><b>' + esc(m.from) + '</b><br>' + esc(m.text) + '<br><small>' + new Date(m.t).toLocaleString() + '</small></div>').join('') || '<p>No chat messages yet. Start the conversation!</p>';
      ph.innerHTML = '<div class="ph" onclick="if(event.target===this)closePh()"><div><div class="row"><h2 style="color:#F4B400">🌐 Online Hub</h2><button class="btn" onclick="window.hub()">↻ Refresh</button></div><p>Signed in as <b>' + esc((typeof ME !== 'undefined' && ME && ME.username) || 'guest') + '</b></p><div class="m"><b>' + Number(status.count || 0) + '</b> active session(s)</div><div class="tabs"><button class="on">Community chat</button><button onclick="window.PALAVAOnline.logout()">Sign out</button></div><div style="max-height:32vh;overflow:auto">' + messages + '</div><div class="row"><input id="palavaChatText" type="text" maxlength="300" placeholder="Send a message to the community" style="flex:1;min-width:0"><button class="btn pri" onclick="window.PALAVAOnline.sendFromHub()">Send</button></div><h3 style="color:#F4B400">Players</h3><div style="max-height:18vh;overflow:auto">' + players + '</div><button class="btn" onclick="closePh()">Close hub</button></div></div>';
    } catch (error) {
      ph.innerHTML = '<div class="ph"><div><h2>Online Hub</h2><p>' + esc(error.message) + '</p><button class="btn" onclick="window.hub()">Try again</button><button class="btn" onclick="closePh()">Close</button></div></div>';
    }
  };
  window.PALAVAOnlineSendChat = async function(text) {
    const result = await request('/api/chat', 'POST', {text});
    return result;
  };
  window.PALAVAOnline = {
    status: () => request('/api/online/players'),
    chat: () => request('/api/chat'),
    sendChat: text => request('/api/chat','POST',{text}),
    sendFromHub: async () => { const input=document.querySelector('#palavaChatText'); const text=(input&&input.value||'').trim(); if(!text)return; try { await request('/api/chat','POST',{text}); await window.hub(); } catch(error) { alert(error.message); } },
    logout: async () => {
      await request('/api/auth/logout','POST');
      if (typeof ME !== 'undefined') ME = null;
      if (typeof title === 'function') title();
    }
  };
  window.addEventListener('load', async () => {
    try {
      const result = await request('/api/auth/me');
      if (result.user && typeof ME !== 'undefined') ME = result.user;
    } catch (_) {}
  });
})();
