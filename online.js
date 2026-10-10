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
  window.PALAVAOnline = {
    status: () => request('/api/online/players'),
    chat: () => request('/api/chat'),
    sendChat: text => request('/api/chat','POST',{text}),
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
