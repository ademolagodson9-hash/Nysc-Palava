const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});

// MVP in-memory store: accounts and cloud saves reset if this service restarts.
// Configure persistent storage/database before treating accounts as production-ready.
const users = new Map();
const sessions = new Map();
const chat = [];
const transfers = [];
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
function publicUser(u) { return {username:u.username,displayName:u.displayName,cheers:u.cheers||0,inbox:(u.inbox||[]).length}; }
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
  const u={username,displayName,password:p,save:null,summary:{},createdAt:Date.now(),cheers:0,inbox:[],cert:null};
  users.set(username,u); issueSession(res,u);
  res.json({ok:true,user:publicUser(u)});
});
app.post('/api/auth/login',(req,res)=>{
  const username=String(req.body?.username||'').trim().toLowerCase();
  const u=users.get(username);
  if(!u||!verifyPassword(String(req.body?.password||''),u.password)) return err(res,401,'Username or password is incorrect.');
  issueSession(res,u); res.json({ok:true,user:publicUser(u)});
});
app.post('/api/auth/logout',(req,res)=>{
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('palava_session='));
  if(token) sessions.delete(decodeURIComponent(token.slice('palava_session='.length)));
  res.setHeader('Set-Cookie','palava_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));
  res.json({ok:true});
});
app.get('/api/auth/me',(req,res)=>{const u=currentUser(req);res.json({user:u?publicUser(u):null});});
app.get('/api/save',(req,res)=>{const u=currentUser(req);res.json({save:u?.save||null,cert:u?.cert||null});});
app.put('/api/save',(req,res)=>{
  const u=currentUser(req); if(!u)return err(res,401,'Sign in to save progress to your account.');
  u.save=req.body?.save||null;u.summary=req.body?.summary||{};u.updatedAt=Date.now();
  res.json({ok:true,cert:u.cert||null});
});
app.post('/api/cheers/claim',(req,res)=>{const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');const n=u.cheers||0;u.cheers=0;res.json({cheers:n});});
app.post('/api/transfer/claim',(req,res)=>{const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');const items=u.inbox.splice(0);res.json({total:items.reduce((a,x)=>a+x.amount,0),items});});
app.get('/api/certificate',(req,res)=>{
  const u=currentUser(req);if(!u)return err(res,401,'Sign in required.');
  if(!u.cert){u.cert='PALAVA-'+crypto.randomBytes(5).toString('hex').toUpperCase();certs.set(u.cert,u.username);}
  res.json({cert:u.cert});
});
app.get('/verify/:serial',(req,res)=>{
  const username=certs.get(req.params.serial);
  if(!username)return res.status(404).send('Certificate not found. PALAVA certificates are game souvenirs, not official NYSC documents.');
  res.type('html').send('<main style="font:16px system-ui;max-width:600px;margin:4rem auto;padding:1rem"><h1>PALAVA Game Certificate</h1><p>Serial: '+req.params.serial.replace(/[&<>"]/g,'')+'</p><p>Player: '+username.replace(/[&<>"]/g,'')+'</p><p>This is a game souvenir, not an official NYSC document.</p></main>');
});
app.get('/api/online/players',(_req,res)=>res.json({count:sessions.size,players:[...users.values()].map(u=>({username:u.username,displayName:u.displayName}))}));
app.get('/api/chat',(req,res)=>res.json({messages:chat.slice(-100)}));
app.post('/api/chat',(req,res)=>{
  const u=currentUser(req);if(!u)return err(res,401,'Sign in to chat.');
  const text=String(req.body?.text||'').trim().slice(0,300);if(!text)return err(res,400,'Message cannot be empty.');
  const item={id:crypto.randomUUID(),from:u.username,text,t:Date.now()};chat.push(item);if(chat.length>500)chat.shift();res.json({ok:true,message:item});
});
app.use(express.static(__dirname,{extensions:['html'],maxAge:'1h'}));
app.get('*',(req,res)=>req.path.startsWith('/api/')?err(res,404,'API route not found.'):res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log('PALAVA listening on '+PORT));
