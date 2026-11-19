const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});

// Runtime caches are hydrated from PostgreSQL when DATABASE_URL is configured.
// Without it, the app deliberately falls back to memory-only development mode.
const users = new Map();
const sessions = new Map();
const chat = [];
const transfers = [];
const walletLedger = [];
const certs = new Map();
const adminPassword = process.env.ADMIN_PASSWORD || '';
const hashPassword = (password, salt=crypto.randomBytes(16).toString('hex')) => ({
  salt, hash: crypto.scryptSync(password,salt,64).toString('hex')
});
const verifyPassword = (password, record) => {
  const candidate=crypto.scryptSync(password,record.salt,64);
  return crypto.timingSafeEqual(candidate,Buffer.from(record.hash,'hex'));
};
function currentUser(req) {
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('palava_session='));
  if(!token) return null;
  const sid=decodeURIComponent(token.slice('palava_session='.length));
  const username=sessions.get(sid);
  return username ? users.get(username) : null;
}
function publicUser(u) { return {username:u.username,displayName:u.displayName,cheers:u.cheers||0,inbox:(u.inbox||[]).length,wallet:Number(u.wallet)||0}; }
function issueSession(res,u) {
  const sid=crypto.randomBytes(32).toString('hex');
  sessions.set(sid,u.username);
  res.setHeader('Set-Cookie','palava_session='+encodeURIComponent(sid)+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000'+(process.env.NODE_ENV==='production'?'; Secure':''));
}
function err(res,status,error){return res.status(status).json({error});}

app.get('/api/health',(_req,res)=>res.json({ok:true,game:'PALAVA'}));
app.post('/api/auth/register',(req,res)=>{
  const username=String(req.body?.username||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  const displayName=String(req.body?.displayName||username).trim().slice(0,32);
  if(!/^[a-z0-9_]{3,20}$/.test(username)) return err(res,400,'Username must be 3–20 letters, numbers or underscores.');
  if(password.length<8) return err(res,400,'Use a password with at least 8 characters.');
  if(users.has(username)) return err(res,409,'That username is already taken.');
  const p=hashPassword(password);
  const u={username,displayName,password:p,save:null,summary:{},createdAt:Date.now(),cheers:0,inbox:[],wallet:5000,cert:null};
  users.set(username,u); issueSession(res,u); schedulePersist();
  res.json({ok:true,user:publicUser(u)});
});
app.post('/api/auth/login',(req,res)=>{
  const username=String(req.body?.username||'').trim().toLowerCase();
  const u=users.get(username);
  if(!u||!verifyPassword(String(req.body?.password||''),u.password)) return err(res,401,'Username or password is incorrect.');
  issueSession(res,u); schedulePersist(); res.json({ok:true,user:publicUser(u)});
});
app.post('/api/auth/logout',(req,res)=>{
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('palava_session='));
  if(token) sessions.delete(decodeURIComponent(token.slice('palava_session='.length))); schedulePersist();
  res.setHeader('Set-Cookie','palava_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));
  res.json({ok:true});
});
app.get('/api/auth/me',(req,res)=>{const u=currentUser(req);res.json({user:u?publicUser(u):null});});
app.get('/api/save',(req,res)=>{const u=currentUser(req);res.json({save:u?.save||null,cert:u?.cert||null});});
app.put('/api/save',(req,res)=>{
  const u=currentUser(req); if(!u)return err(res,401,'Sign in to save progress to your account.');
  u.save=req.body?.save||null;u.summary=req.body?.summary||{};u.updatedAt=Date.now(); schedulePersist();
  res.json({ok:true,cert:u.cert||null});
});
app.post('/api/cheers/claim',(req,res)=>{const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');const n=u.cheers||0;u.cheers=0;schedulePersist();res.json({cheers:n});});
app.post('/api/transfer/claim',(req,res)=>{const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');const items=u.inbox.splice(0);schedulePersist();res.json({total:items.reduce((a,x)=>a+x.amount,0),items});});

app.get('/api/wallet',(req,res)=>{
  const u=currentUser(req);if(!u)return err(res,401,'Sign in to use your PALAVA wallet.');
  res.json({balance:Number(u.wallet)||0,transactions:walletLedger.filter(t=>t.from===u.username||t.to===u.username).slice(-30).reverse()});
});
app.post('/api/wallet/transfer',(req,res)=>{
  const u=currentUser(req);if(!u)return err(res,401,'Sign in to transfer PALAVA game money.');
  const recipientName=String(req.body?.recipient||'').trim().toLowerCase();
  const amount=Number(req.body?.amount);
  if(!/^[a-z0-9_]{3,20}$/.test(recipientName))return err(res,400,'Enter a valid recipient username.');
  if(recipientName===u.username)return err(res,400,'You cannot transfer money to yourself.');
  if(!Number.isSafeInteger(amount)||amount<1||amount>100000)return err(res,400,'Transfer must be between ₦1 and ₦100,000.');
  const recipient=users.get(recipientName);if(!recipient)return err(res,404,'That PALAVA player was not found.');
  u.wallet=Number(u.wallet)||0;recipient.wallet=Number(recipient.wallet)||0;
  if(u.wallet<amount)return err(res,400,'Insufficient PALAVA wallet balance.');
  u.wallet-=amount;recipient.wallet+=amount;
  const tx={id:crypto.randomUUID(),from:u.username,to:recipient.username,amount,t:Date.now(),type:'player-transfer'};
  walletLedger.push(tx);if(walletLedger.length>2000)walletLedger.shift();schedulePersist();
  res.json({ok:true,balance:u.wallet,transaction:tx,message:'PALAVA game money transferred successfully.'});
});

app.get('/api/certificate',(req,res)=>{
  const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');
  if(!u.cert){u.cert='PALAVA-'+crypto.randomBytes(5).toString('hex').toUpperCase();u.certIssued=Date.now();}
  const s=u.summary||{};
  const cert={serial:u.cert,username:u.username,name:s.name||u.displayName,course:s.course||'Not recorded',ppa:s.ppa||'Not recorded',city:s.city||'Not recorded',state:s.state||'Not recorded',ending:s.ending||'PALAVA Graduate',score:Number(s.score)||0,grade:s.grade||'Game completion',issued:u.certIssued||Date.now()};
  certs.set(u.cert,cert);schedulePersist();
  res.json({cert:u.cert});
});
app.get('/api/verify/:serial',(req,res)=>{
  const cert=certs.get(req.params.serial);
  if(!cert)return res.status(404).json({valid:false,error:'Certificate not found'});
  res.json({valid:true,cert});
});
app.get('/verify/:serial',(req,res)=>{
  const cert=certs.get(req.params.serial);
  if(!cert)return res.status(404).send('Certificate not found. PALAVA certificates are game souvenirs, not official NYSC documents.');
  const safe=x=>String(x||'').replace(/[&<>"]/g,'');
  res.type('html').send('<main style="font:16px system-ui;max-width:600px;margin:4rem auto;padding:1rem"><h1>PALAVA Game Certificate</h1><p>Serial: '+safe(cert.serial)+'</p><p>Player: '+safe(cert.username)+'</p><p>Course: '+safe(cert.course)+'</p><p>PPA: '+safe(cert.ppa)+', '+safe(cert.city)+', '+safe(cert.state)+'</p><p>This is a game souvenir, not an official NYSC document.</p></main>');
});
app.get('/api/online/players',(_req,res)=>res.json({count:sessions.size,players:[...users.values()].map(u=>({username:u.username,displayName:u.displayName}))}));
app.get('/api/chat',(req,res)=>res.json({messages:chat.slice(-100)}));
app.post('/api/chat',(req,res)=>{
  const u=currentUser(req);if(!u)return err(res,401,'Sign in to chat.');
  const text=String(req.body?.text||'').trim().slice(0,300);if(!text)return err(res,400,'Message cannot be empty.');
  const item={id:crypto.randomUUID(),from:u.username,text,t:Date.now()};chat.push(item);if(chat.length>500)chat.shift();schedulePersist();res.json({ok:true,message:item});
});
app.delete('/api/account',(req,res)=>{
  const u=currentUser(req);
  if(!u)return err(res,401,'Sign in before deleting your account.');
  const username=u.username;
  for(const [sid,name] of sessions.entries())if(name===username)sessions.delete(sid);
  users.delete(username);
  for(const [serial,cert] of certs.entries())if(cert.username===username)certs.delete(serial);
  for(let i=chat.length-1;i>=0;i--)if(chat[i].from===username)chat.splice(i,1);
  res.setHeader('Set-Cookie','palava_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));
  schedulePersist();res.json({ok:true,message:'Account and associated game data deleted from the active PALAVA service.'});
});

// Lightweight multiplayer rooms: shared state is in memory on this starter deployment.
// Use PostgreSQL + WebSockets/Socket.IO before production-scale or ranked play.
const gameRooms = new Map();

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 }) : null;
let persistTimer = null;
let persistenceReady = false;
function snapshotState() {
  return { users:[...users.entries()], sessions:[...sessions.entries()], chat, transfers, walletLedger, certs:[...certs.entries()], gameRooms:[...gameRooms.entries()] };
}
function restoreState(state) {
  for (const [k,v] of state.users || []) users.set(k,v);
  for (const [k,v] of state.sessions || []) sessions.set(k,v);
  chat.push(...(state.chat || [])); transfers.push(...(state.transfers || [])); walletLedger.push(...(state.walletLedger || []));
  for (const [k,v] of state.certs || []) certs.set(k,v);
  for (const [k,v] of state.gameRooms || []) gameRooms.set(k,v);
}
async function initPersistence() {
  if (!pool) { console.warn('PALAVA persistence disabled: DATABASE_URL is not configured.'); return; }
  await pool.query('CREATE TABLE IF NOT EXISTS palava_state (id SMALLINT PRIMARY KEY CHECK (id = 1), payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const result = await pool.query('SELECT payload FROM palava_state WHERE id = 1');
  if (result.rows[0]?.payload) restoreState(result.rows[0].payload);
  persistenceReady = true;
  console.log('PALAVA PostgreSQL persistence ready.');
}
async function persistState() {
  if (!pool || !persistenceReady) return;
  await pool.query('INSERT INTO palava_state (id,payload,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=NOW()', [JSON.stringify(snapshotState())]);
}
function schedulePersist() {
  if (!pool || !persistenceReady) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { persistTimer = null; persistState().catch(e => console.error('PALAVA persistence write failed:', e.message)); }, 150);
  if (persistTimer.unref) persistTimer.unref();
}
const GAME_TYPES = new Set(['ludo','whot','ayo','chess']);
function roomPublic(r){return {id:r.id,game:r.game,title:r.title,host:r.host,players:r.players.map(p=>({username:p.username,displayName:p.displayName})),maxPlayers:r.maxPlayers,status:r.status==='closed'?'closed':(r.players.length>=r.maxPlayers?'full':'waiting'),turn:r.turn,events:r.events.slice(-30),state:{started:!!r.state.started,moves:r.state.moves.slice(-100)},updatedAt:r.updatedAt};}
function roomEvent(r,event){r.events.push(event);if(r.events.length>100)r.events.splice(0,r.events.length-100);r.updatedAt=Date.now();}
app.get('/api/multiplayer/rooms',(req,res)=>res.json({rooms:[...gameRooms.values()].filter(r=>r.status!=='closed').map(roomPublic)}));
app.get('/api/multiplayer/rooms/:id',(req,res)=>{
 const u=currentUser(req);if(!u)return err(res,401,'Sign in to view a multiplayer room.');
 const r=gameRooms.get(String(req.params.id).toUpperCase());
 if(!r||r.status==='closed')return err(res,404,'Room not found.');
 if(!r.players.some(p=>p.username===u.username))return err(res,403,'Join this room to view its live game feed.');
 res.setHeader('Cache-Control','no-store');
 res.json({room:roomPublic(r)});
});
app.post('/api/multiplayer/rooms',(req,res)=>{
 const u=currentUser(req);if(!u)return err(res,401,'Sign in to create a multiplayer room.');
 const game=String(req.body?.game||'').toLowerCase();if(!GAME_TYPES.has(game))return err(res,400,'Choose Ludo, Whot, Ayo Opon or Chess.');
 const maxPlayers=game==='chess'||game==='ayo'?2:game==='whot'?4:4;
 if(gameRooms.size>=100)return err(res,503,'The multiplayer lobby is busy. Try again shortly.');
 const id=crypto.randomBytes(3).toString('hex').toUpperCase();
 const room={id,game,title:String(req.body?.title||game.toUpperCase()+' room').slice(0,50),host:u.username,players:[{username:u.username,displayName:u.displayName}],maxPlayers,turn:0,events:[{type:'system',text:u.displayName+' created a '+game.toUpperCase()+' room',t:Date.now()}],state:{moves:[],started:false},updatedAt:Date.now(),status:'waiting'};
 gameRooms.set(id,room);schedulePersist();res.status(201).json({room:roomPublic(room)});
});
app.post('/api/multiplayer/rooms/:id/join',(req,res)=>{
 const u=currentUser(req);if(!u)return err(res,401,'Sign in to join multiplayer games.');
 const r=gameRooms.get(String(req.params.id).toUpperCase());if(!r||r.status==='closed')return err(res,404,'Room not found.');
 if(!r.players.some(p=>p.username===u.username)){if(r.players.length>=r.maxPlayers)return err(res,409,'This room is full.');r.players.push({username:u.username,displayName:u.displayName});roomEvent(r,{type:'system',text:u.displayName+' joined the room',t:Date.now()});}
 if(r.players.length>=2)r.state.started=true;schedulePersist();res.json({room:roomPublic(r)});
});
app.post('/api/multiplayer/rooms/:id/move',(req,res)=>{
 const u=currentUser(req);if(!u)return err(res,401,'Sign in to play multiplayer games.');
 const r=gameRooms.get(String(req.params.id).toUpperCase());if(!r||!r.players.some(p=>p.username===u.username))return err(res,404,'Join this room before playing.');
 const text=String(req.body?.text||'').trim().slice(0,180);if(!text)return err(res,400,'Enter a move or game action.');
 const move={by:u.username,text,t:Date.now()};r.state.moves.push(move);if(r.state.moves.length>100)r.state.moves.splice(0,r.state.moves.length-100);roomEvent(r,{type:'move',text:u.displayName+': '+text,t:Date.now()});r.turn=(r.turn+1)%Math.max(1,r.players.length);schedulePersist();res.setHeader('Cache-Control','no-store');res.json({room:roomPublic(r)});
});
app.post('/api/multiplayer/rooms/:id/leave',(req,res)=>{
 const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');
 const r=gameRooms.get(String(req.params.id).toUpperCase());if(!r)return res.json({ok:true});
 r.players=r.players.filter(p=>p.username!==u.username);roomEvent(r,{type:'system',text:u.displayName+' left the room',t:Date.now()});
 if(!r.players.length)gameRooms.delete(r.id);else if(r.host===u.username)r.host=r.players[0].username;
 schedulePersist();res.json({ok:true});
});

app.use(express.static(__dirname,{extensions:['html'],maxAge:'1h'}));
app.get('*',(req,res)=>req.path.startsWith('/api/')?err(res,404,'API route not found.'):res.sendFile(path.join(__dirname,'index.html')));
initPersistence().then(() => {
  const server = app.listen(PORT,'0.0.0.0',()=>console.log('PALAVA listening on '+PORT));
  const shutdown = async () => { try { if (persistTimer) clearTimeout(persistTimer); await persistState(); if (pool) await pool.end(); } catch(e) { console.error('PALAVA shutdown persistence error:',e.message); } server.close(()=>process.exit(0)); };
  process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
}).catch(error => { console.error('PALAVA database initialization failed:',error); process.exit(1); });
