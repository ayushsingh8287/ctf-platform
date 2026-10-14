const express=require('express'),helmet=require('helmet'),{Pool}=require('pg'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),cp=require('cookie-parser'),rateLimit=require('express-rate-limit'),multer=require('multer'),crypto=require('crypto');
const E=process.env,PROD=E.NODE_ENV==='production';
/* ======== ORGANIZER CONFIG ======== */
const DEFAULT_FLAG='CTF{default_flag_here}'; // only seeds the demo challenge. Change real flags in Admin > Challenges.
const CATS=['Steganography','Forensics','Basic Web Exploitation','OSINT','Cryptography','Log Analysis','Image Analysis','File Analysis','Miscellaneous','Basic Reversing'],DIFFS=['Easy','Medium','Hard'];
const ALLOWED_EXT=['png','jpg','jpeg','gif','txt','log','zip','pcap','pcapng','pdf','csv','json','bin'];
/* ================================== */
for(const k of['DATABASE_URL','JWT_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD_HASH'])if(!E[k]){console.error('Missing env var '+k);process.exit(1);}
const db=new Pool({connectionString:E.DATABASE_URL,ssl:PROD?{rejectUnauthorized:false}:undefined});
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const cfg=async k=>(await q('select value from admin_cfg where key=$1',[k]))[0]?.value;
const setCfg=(k,v)=>q('insert into admin_cfg(key,value) values($1,$2) on conflict(key) do update set value=$2',[k,String(v)]);
const hmac=s=>crypto.createHmac('sha256',E.JWT_SECRET).update(String(s)).digest('hex');
// Email via HTTPS API (Resend). Free hosts often block SMTP ports, so no SMTP is used.
async function mail(to,subject,text){
 if(!E.RESEND_API_KEY){if(PROD)throw new Error('RESEND_API_KEY missing');console.log('[DEV MAIL ONLY - not sent]',to,subject,'\n'+text);return;}
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM||'CTF Platform <onboarding@resend.dev>',to:[to],subject,text})});
 if(!r.ok)throw new Error('mail failed '+r.status);}
const sha=s=>crypto.createHash('sha256').update(String(s)).digest();
const eqHash=(s,hex)=>{
  const a=sha(s),b=Buffer.from(String(hex||''),'hex');
  if(a.length!==b.length)return false;
  try{return crypto.timingSafeEqual(a,b);}catch{return false;}
};
const log=(m,req,x={})=>console.warn(JSON.stringify({m,ip:req.ip,path:req.path,t:new Date().toISOString(),...x}));
const bad=(res,error,code=400)=>res.status(code).json({error});
const em=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())?v.trim().toLowerCase():null;
const PW=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,72}$/;
const MULT=Number(E.RATE_MULT)||1; // set RATE_MULT=50 while testing to loosen all limits; remove for the real event
const lim=(max,win=15*60*1000)=>rateLimit({windowMs:win,max:max*MULT,standardHeaders:true,legacyHeaders:false,message:{error:'Too many requests. Slow down.'}});

const app=express();app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"]}},frameguard:{action:'deny'},referrerPolicy:{policy:'strict-origin-when-cross-origin'},hsts:PROD}));
app.use((req,res,next)=>{res.set('Permissions-Policy','camera=(),microphone=(),geolocation=(),payment=()');next();});
app.use(cp(),express.json({limit:'200kb'}));
app.use((req,res,next)=>{req.body??={};
  if(!req.cookies.csrf){const t=crypto.randomBytes(24).toString('hex');req.cookies.csrf=t;res.cookie('csrf',t,{secure:PROD,sameSite:'strict'});}
  if(!['GET','HEAD'].includes(req.method)&&req.get('x-csrf-token')!==req.cookies.csrf)return bad(res,'Bad CSRF token',403);
  next();});
app.use(express.static('client/dist'));

const setTok=(res,o)=>res.cookie('tok',jwt.sign(o,E.JWT_SECRET,{expiresIn:'30m'}),{httpOnly:true,secure:PROD,sameSite:'strict',maxAge:30*60*1000});
const need=role=>async(req,res,next)=>{try{const t=jwt.verify(req.cookies.tok||'',E.JWT_SECRET);if(t.role!==role)throw 0;
  if(role==='admin'&&(t.v||0)!==Number(await cfg('tokver')||0))throw 0; // password change revokes every older admin session
  if(t.exp*1000-Date.now()<10*60*1000)setTok(res,{role:t.role,email:t.email,team:t.team,v:t.v}); // sliding refresh
  req.u=t;next();}catch{if(role==='admin')log('unauthorized admin access',req);bad(res,'Unauthorized',401);}};

/* ---------- schema ---------- */
async function init(){
 await db.query(`
 create table if not exists approved(email text primary key,team_key text not null,team_name text not null,leader_name text not null,leader_email text not null,members jsonb not null,size int not null,created timestamptz default now());
 create table if not exists users(email text primary key references approved(email) on delete cascade,hash text not null,created timestamptz default now(),password_updated timestamptz default now(),failed int default 0,locked_until timestamptz,reset_hash text,reset_expires timestamptz);
 create table if not exists admin_cfg(key text primary key,value text);
 create table if not exists pw_log(id serial primary key,email text,kind text,ts timestamptz default now());
 create table if not exists challenges(id serial primary key,title text,category text,difficulty text,points int,description text,flag_hash text,enabled bool default true,hidden bool default false,deleted bool default false,created timestamptz default now());
 create table if not exists files(id serial primary key,challenge_id int references challenges(id),name text,mime text,size int,data bytea);
 create table if not exists solves(team_key text,challenge_id int,points int,by_email text,ts timestamptz default now(),primary key(team_key,challenge_id));
 create table if not exists submissions(id serial primary key,team_key text,challenge_id int,flag text,correct bool,points int,ip text,by_email text,ts timestamptz default now());`);
 if(!(await q('select 1 from challenges limit 1')).length)
  await q(`insert into challenges(title,category,difficulty,points,description,flag_hash) values('Welcome Flag','Miscellaneous','Easy',50,'Demo challenge. Submit the default flag to test scoring.',$1)`,[sha(DEFAULT_FLAG).toString('hex')]);
}

/* ---------- auth ---------- */
app.post('/api/signup',lim(10),async(req,res)=>{
 const email=em(req.body.email),{password,confirm}=req.body;
 if(!email||typeof password!=='string')return bad(res,'Invalid input.');
 if(!(await q('select 1 from approved where email=$1',[email])).length)return bad(res,'This email is not registered for the CTF. Please register through the official Google Form.',403);
 if(!PW.test(password))return bad(res,'Password needs 8+ characters with uppercase, lowercase, a number and a special character.');
 if(password!==confirm)return bad(res,'Passwords do not match.');
 const r=await q('insert into users(email,hash) values($1,$2) on conflict do nothing returning email',[email,await bcrypt.hash(password,12)]);
 if(!r.length)return bad(res,'An account already exists with this email. Please login.',409);
 await q("insert into pw_log(email,kind) values($1,'created')",[email]);res.json({ok:true});});

app.post('/api/login',lim(30),async(req,res)=>{
 const email=em(req.body.email),pw=req.body.password;
 const [u]=email&&typeof pw==='string'?await q('select * from users where email=$1',[email]):[];
 if(u?.locked_until&&u.locked_until>new Date())return bad(res,'Too many failed attempts. Try again in 10 minutes.',429);
 if(!u||!(await bcrypt.compare(pw,u.hash))){
  if(u){const f=u.failed+1;await q('update users set failed=$2,locked_until=$3 where email=$1',[email,f>=5?0:f,f>=5?new Date(Date.now()+600000):null]);}
  log('failed login',req,{email});return bad(res,'Invalid email or password.',401);}
 await q('update users set failed=0,locked_until=null where email=$1',[email]);
 const [a]=await q('select team_key from approved where email=$1',[email]);
 setTok(res,{role:'team',email,team:a.team_key});res.json({ok:true});});

app.post('/api/logout',(req,res)=>{res.clearCookie('tok',{httpOnly:true,secure:PROD,sameSite:'strict'});res.json({ok:true});});

// Forgot password: needs a one-time code the organizer generates (Admin > Teams). Email alone must never be enough to reset a password.
app.post('/api/forgot',lim(8),async(req,res)=>{
 const email=em(req.body.email),{code,password}=req.body;
 const [u]=email?await q('select * from users where email=$1',[email]):[];
 if(!u||!u.reset_hash||u.reset_expires<new Date()||typeof code!=='string'||!eqHash(code.trim().toUpperCase(),u.reset_hash)){log('bad reset',req,{email});return bad(res,'Invalid or expired reset code. Ask the organizer for a new one.',400);}
 if(typeof password!=='string'||!PW.test(password))return bad(res,'Password needs 8+ characters with uppercase, lowercase, a number and a special character.');
 await q('update users set hash=$2,password_updated=now(),reset_hash=null,reset_expires=null,failed=0,locked_until=null where email=$1',[email,await bcrypt.hash(password,12)]);
 await q("insert into pw_log(email,kind) values($1,'reset')",[email]);
 res.json({ok:true,message:'Password updated successfully. You can now login with your new password.'});});

/* ---------- participant ---------- */
const board=()=>q(`select a.team_key,a.team_name,coalesce(sum(s.points),0)::int pts,max(s.ts) last from (select distinct team_key,team_name from approved) a left join solves s on s.team_key=a.team_key group by a.team_key,a.team_name order by pts desc,last asc nulls last,a.team_name`);
app.get('/api/me',need('team'),async(req,res)=>{
 const [t]=await q('select team_name,leader_name,leader_email,members from approved where email=$1',[req.u.email]);
 const b=await board(),i=b.findIndex(x=>x.team_key===req.u.team);
 const [{n}]=await q('select count(*)::int n from challenges where enabled and not hidden and not deleted');
 const [{s}]=await q('select count(*)::int s from solves where team_key=$1',[req.u.team]);
 res.json({...t,points:b[i]?.pts??0,solved:s,total:n,rank:i+1});});
app.get('/api/leaderboard',need('team'),async(req,res)=>{
 const b=(await board()).map((x,i)=>({rank:i+1,team:x.team_name,points:x.pts,mine:x.team_key===req.u.team}));
 res.json(b.filter((x,i)=>i<20||x.mine));});
app.get('/api/challenges',need('team'),async(req,res)=>{
 const cs=await q(`select c.id,c.title,c.category,c.difficulty,c.points,c.description,(s.team_key is not null) solved from challenges c left join solves s on s.challenge_id=c.id and s.team_key=$1 where c.enabled and not c.hidden and not c.deleted order by c.points,c.id`,[req.u.team]);
 const fs=cs.length?await q('select id,challenge_id,name,size from files where challenge_id=any($1)',[cs.map(c=>c.id)]):[];
 cs.forEach(c=>c.files=fs.filter(f=>f.challenge_id===c.id));res.json(cs);});
const subLim=rateLimit({windowMs:60000,max:15*MULT,keyGenerator:req=>req.u?.team||req.ip,message:{error:'Too many submissions. Wait a minute.'}});
app.post('/api/challenges/:id/submit',need('team'),subLim,async(req,res)=>{
 const id=Number(req.params.id),flag=req.body.flag;
 if(!Number.isInteger(id)||typeof flag!=='string'||!flag.trim()||flag.length>200)return bad(res,'Invalid input.');
 const [c]=await q('select * from challenges where id=$1 and enabled and not hidden and not deleted',[id]);
 if(!c)return bad(res,'Challenge not available.',404);
 const already={status:'already',message:'Your team has already solved this challenge.'};
 if((await q('select 1 from solves where team_key=$1 and challenge_id=$2',[req.u.team,id])).length)return res.json(already);
 const ok=eqHash(flag.trim(),c.flag_hash);let pts=0;
 if(ok){const r=await q('insert into solves(team_key,challenge_id,points,by_email) values($1,$2,$3,$4) on conflict do nothing returning 1',[req.u.team,id,c.points,req.u.email]);if(!r.length)return res.json(already);pts=c.points;}
 await q('insert into submissions(team_key,challenge_id,flag,correct,points,ip,by_email) values($1,$2,$3,$4,$5,$6,$7)',[req.u.team,id,flag.slice(0,200),ok,pts,req.ip,req.u.email]);
 res.json(ok?{status:'correct',message:'Correct flag! Points added to your team.'}:{status:'wrong',message:'Incorrect flag. Try again.'});});
app.get('/api/files/:id',need('team'),lim(60,60000),async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isInteger(id))return bad(res,'Invalid input.');
 const [f]=await q('select f.name,f.data from files f join challenges c on c.id=f.challenge_id where f.id=$1 and c.enabled and not c.hidden and not c.deleted',[id]);
 if(!f)return bad(res,'Not found.',404);
 res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${f.name}"`,'X-Content-Type-Options':'nosniff'});res.send(f.data);});

/* ---------- admin ---------- */
app.post('/api/admin/login',lim(8),async(req,res)=>{
 const {email,password}=req.body,s=v=>typeof v==='string'?v:'';
 const good=await bcrypt.compare(s(password),(await cfg('pw_hash'))||E.ADMIN_PASSWORD_HASH);
 if(!(good&&s(email).toLowerCase()===E.ADMIN_EMAIL.toLowerCase())){log('admin login failed',req);return bad(res,'Invalid credentials.',401);}
 setTok(res,{role:'admin',email:'admin',v:Number(await cfg('tokver')||0)});res.json({ok:true});});

/* ---- admin password change with email OTP ---- */
const adminEmail=()=>E.ADMIN_EMAIL.trim().toLowerCase();
async function sendOtp(req,res){
 if(Date.now()-Number(await cfg('otp_sent')||0)<60000)return bad(res,'Please wait a minute before requesting another code.',429);
 const otp=String(crypto.randomInt(100000,1000000));
 await setCfg('otp_hash',hmac(otp));await setCfg('otp_exp',Date.now()+600000);await setCfg('otp_tries',0);await setCfg('otp_sent',Date.now());
 try{await mail(E.ADMIN_EMAIL,'Your admin verification code',`Your admin verification code is ${otp}\nIt expires in 10 minutes.\nRequested from IP ${req.ip}.\nIf this was not you, ignore this email and change your admin password.`);}
 catch(e){console.error(e.message);return bad(res,'Email could not be sent. Check the email settings.',503);}
 res.json({ok:true,message:'A 6-digit code was sent to the admin email. It expires in 10 minutes.'});}
async function checkOtp(otp){
 const h=await cfg('otp_hash'),tries=Number(await cfg('otp_tries')||0);
 if(!h||Date.now()>Number(await cfg('otp_exp')||0)||tries>=5||typeof otp!=='string'||!/^[0-9]{6}$/.test(otp.trim()))return false;
 const actual=Buffer.from(hmac(otp.trim()),'hex'),expected=Buffer.from(h,'hex');
 await setCfg('otp_tries',tries+1);
 if(actual.length!==expected.length)return false;
 try{return crypto.timingSafeEqual(actual,expected);}catch{return false;}
}
const strongAdmin=p=>typeof p==='string'&&p.length>=12&&p.length<=72&&PW.test(p);
const WEAK='Admin password needs 12+ characters with uppercase, lowercase, a number and a special character.';
async function applyNew(res,password){
 await setCfg('pw_hash',await bcrypt.hash(password,12));await setCfg('tokver',Number(await cfg('tokver')||0)+1);await setCfg('otp_hash','');
 res.clearCookie('tok',{httpOnly:true,secure:PROD,sameSite:'strict'});
 res.json({ok:true,message:'Admin password changed. All admin sessions were signed out. Please login again.'});}
// not logged in (forgot password): the code goes only to the admin email, and the reply never reveals if an email matched
app.post('/api/admin/forgot/request',lim(5),async(req,res)=>{
 if(em(req.body.email)===adminEmail())return sendOtp(req,res);
 log('admin reset requested for unknown email',req);res.json({ok:true,message:'If that is the admin email, a code was sent.'});});
app.post('/api/admin/forgot/reset',lim(8),async(req,res)=>{
 const {email,otp,password}=req.body;
 if(em(email)!==adminEmail()||!(await checkOtp(otp))){log('bad admin otp',req);return bad(res,'Invalid or expired code.',400);}
 if(!strongAdmin(password))return bad(res,WEAK);await applyNew(res,password);});
// logged in (Admin > security)
app.post('/api/admin/security/otp',need('admin'),lim(5),(req,res)=>sendOtp(req,res));
app.post('/api/admin/security/change',need('admin'),lim(8),async(req,res)=>{
 if(!(await checkOtp(req.body.otp))){log('bad admin otp',req);return bad(res,'Invalid or expired code.',400);}
 if(!strongAdmin(req.body.password))return bad(res,WEAK);await applyNew(res,req.body.password);});
const A=need('admin');
app.get('/api/admin/overview',A,async(req,res)=>{
 const teams=await q('select distinct on(team_key) team_key,team_name,leader_name,leader_email,members,size,created from approved order by team_key');
 const accounts=await q('select u.email,a.team_key,u.created,u.password_updated from users u join approved a using(email)');
 const hist=await q('select email,kind,ts from pw_log order by ts desc');
 const b=await board();
 teams.forEach(t=>{const i=b.findIndex(x=>x.team_key===t.team_key);t.points=b[i].pts;t.rank=i+1;t.accounts=accounts.filter(a=>a.team_key===t.team_key).map(a=>({...a,history:hist.filter(h=>h.email===a.email)}));});
 const cnt=n=>teams.filter(t=>t.size===n).length;
 res.json({teams,stats:{teams:teams.length,participants:teams.reduce((a,t)=>a+t.size,0),solo:cnt(1),two:cnt(2),three:cnt(3)},recent:[...teams].sort((a,b)=>b.created-a.created).slice(0,5).map(t=>t.team_name)});});
// Remove whole teams (emails, accounts, scores, submissions). Admin only.
app.post('/api/admin/teams/remove',A,async(req,res)=>{
 const keys=Array.isArray(req.body.team_keys)?req.body.team_keys.filter(k=>typeof k==='string').slice(0,200):[];
 if(!keys.length)return bad(res,'No teams selected.');
 const c=await db.connect();
 try{await c.query('begin');
  await c.query('delete from solves where team_key=any($1)',[keys]);
  await c.query('delete from submissions where team_key=any($1)',[keys]);
  const r=await c.query('delete from approved where team_key=any($1) returning email',[keys]); // accounts are removed by FK cascade
  await c.query('delete from pw_log where email=any($1)',[r.rows.map(x=>x.email)]);
  await c.query('commit');log('admin removed teams',req,{teams:keys.length});res.json({teams:keys.length,emails:r.rowCount});}
 catch(e){await c.query('rollback');throw e;}finally{c.release();}});
// Remove one non-leader member email (and their account). Admin only.
app.post('/api/admin/participants/remove',A,async(req,res)=>{
 const email=em(req.body.email);if(!email)return bad(res,'Invalid email.');
 const [a]=await q('select team_key,leader_email from approved where email=$1',[email]);
 if(!a)return bad(res,'Email not found.',404);
 if(a.leader_email===email)return bad(res,'This is the team leader. Remove the whole team instead.');
 await q('delete from approved where email=$1',[email]);await q('delete from pw_log where email=$1',[email]);
 const [t]=await q('select members from approved where team_key=$1 limit 1',[a.team_key]);
 if(t){const ms=t.members.filter(m=>m.email!==email);await q('update approved set members=$2,size=$3 where team_key=$1',[a.team_key,JSON.stringify(ms),ms.length]);}
 log('admin removed participant',req);res.json({ok:true});});
app.post('/api/admin/reset-code',A,async(req,res)=>{
 const email=em(req.body.email),code=crypto.randomBytes(4).toString('hex').toUpperCase();
 const r=email&&await q("update users set reset_hash=$2,reset_expires=now()+interval '1 hour' where email=$1 returning email",[email,sha(code).toString('hex')]);
 if(!r?.length)return bad(res,'No account for that email.',404);res.json({code,expires:'1 hour'});});
const parseCsv=t=>t.split(/\r?\n/).filter(l=>l.trim()).map(l=>{const o=[];l.replace(/("([^"]*)"|[^,]*)(,|$)/g,(m,a,b)=>{o.push((b??a).trim());return '';});return o;});
app.post('/api/admin/import',A,async(req,res)=>{ // CSV columns: team, leader name, leader email, m1 name, m1 email, m2 name, m2 email
 if(typeof req.body.csv!=='string'||req.body.csv.length>500000)return bad(res,'Invalid CSV.');
 let teams=0,emails=0;
 for(const r of parseCsv(req.body.csv)){
  const lead=em(r[2]);if(!lead||!r[0]||!r[1])continue;
  const members=[{name:r[1].slice(0,80),email:lead}];
  for(const i of[3,5]){const e=em(r[i+1]);if(r[i]&&e&&!members.some(m=>m.email===e))members.push({name:r[i].slice(0,80),email:e});}
  for(const m of members){await q(`insert into approved(email,team_key,team_name,leader_name,leader_email,members,size) values($1,$2,$3,$4,$5,$6,$7) on conflict(email) do update set team_key=$2,team_name=$3,leader_name=$4,leader_email=$5,members=$6,size=$7`,[m.email,lead,r[0].slice(0,80),r[1].slice(0,80),lead,JSON.stringify(members),members.length]);emails++;}
  teams++;}
 res.json({teams,emails});});
const up=multer({storage:multer.memoryStorage(),limits:{fileSize:20e6,files:5},fileFilter:(r,f,cb)=>cb(null,ALLOWED_EXT.includes(f.originalname.split('.').pop().toLowerCase()))});
const chal=(b,needFlag)=>{const c={title:String(b.title||'').trim().slice(0,100),category:b.category,difficulty:b.difficulty,points:Number(b.points),description:String(b.description||'').slice(0,5000),flag:typeof b.flag==='string'&&b.flag.trim()?b.flag.trim().slice(0,200):null};
 return c.title&&CATS.includes(c.category)&&DIFFS.includes(c.difficulty)&&Number.isInteger(c.points)&&c.points>0&&c.points<=10000&&(c.flag||!needFlag)?c:null;};
const addFiles=(id,fs=[])=>Promise.all(fs.map(f=>q('insert into files(challenge_id,name,mime,size,data) values($1,$2,$3,$4,$5)',[id,f.originalname.replace(/[^\w.\-]/g,'_').slice(0,100),'application/octet-stream',f.size,f.buffer])));
app.get('/api/admin/challenges',A,async(req,res)=>{
 const cs=await q('select c.id,c.title,c.category,c.difficulty,c.points,c.description,c.enabled,c.hidden,(select count(*)::int from solves s where s.challenge_id=c.id) solves from challenges c where not deleted order by id');
 const fs=await q('select id,challenge_id,name,size from files');cs.forEach(c=>c.files=fs.filter(f=>f.challenge_id===c.id));res.json({cs,CATS,DIFFS});});
app.post('/api/admin/challenges',A,up.array('files'),async(req,res)=>{
 const c=chal(req.body,true);if(!c)return bad(res,'Check title, category, difficulty, points and flag.');
 const [r]=await q('insert into challenges(title,category,difficulty,points,description,flag_hash) values($1,$2,$3,$4,$5,$6) returning id',[c.title,c.category,c.difficulty,c.points,c.description,sha(c.flag).toString('hex')]);
 await addFiles(r.id,req.files);res.json({id:r.id});});
app.put('/api/admin/challenges/:id',A,up.array('files'),async(req,res)=>{ // edits never touch existing solves/scores
 const id=Number(req.params.id),c=chal(req.body,false);if(!Number.isInteger(id)||!c)return bad(res,'Invalid input.');
 await q('update challenges set title=$2,category=$3,difficulty=$4,points=$5,description=$6,flag_hash=coalesce($7,flag_hash) where id=$1',[id,c.title,c.category,c.difficulty,c.points,c.description,c.flag&&sha(c.flag).toString('hex')]);
 if(req.body.replace_files==='1'&&req.files?.length)await q('delete from files where challenge_id=$1',[id]);
 await addFiles(id,req.files);res.json({ok:true});});
app.patch('/api/admin/challenges/:id',A,async(req,res)=>{
 const id=Number(req.params.id),b=x=>typeof x==='boolean'?x:null;if(!Number.isInteger(id))return bad(res,'Invalid input.');
 await q('update challenges set enabled=coalesce($2,enabled),hidden=coalesce($3,hidden) where id=$1',[id,b(req.body.enabled),b(req.body.hidden)]);res.json({ok:true});});
app.delete('/api/admin/challenges/:id',A,async(req,res)=>{ // soft delete keeps submissions and scores
 const id=Number(req.params.id);if(!Number.isInteger(id))return bad(res,'Invalid input.');
 await q('update challenges set deleted=true,enabled=false where id=$1',[id]);res.json({ok:true});});
app.get('/api/admin/activity',A,async(req,res)=>{
 res.json({submissions:await q('select s.ts,a.team_name,c.title,s.flag,s.correct,s.points,s.ip from submissions s left join challenges c on c.id=s.challenge_id left join (select distinct team_key,team_name from approved) a on a.team_key=s.team_key order by s.ts desc limit 500'),
  solves:await q('select s.ts,a.team_name,c.title,s.points from solves s left join challenges c on c.id=s.challenge_id left join (select distinct team_key,team_name from approved) a on a.team_key=s.team_key order by s.ts desc limit 500')});});
const cell=v=>{v=String(v??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
app.get('/api/admin/export.csv',A,async(req,res)=>{
 const b=await board(),rows=await q('select distinct on(team_key) * from approved order by team_key');
 const out=[['Rank','Team','Leader','Leader email','Members','Size','Points']];
 b.forEach((x,i)=>{const t=rows.find(r=>r.team_key===x.team_key);out.push([i+1,x.team_name,t.leader_name,t.leader_email,t.members.map(m=>`${m.name} <${m.email}>`).join('; '),t.size,x.pts]);});
 res.set({'Content-Type':'text/csv','Content-Disposition':'attachment; filename="teams.csv"'}).send(out.map(r=>r.map(cell).join(',')).join('\n'));});

app.use('/api',(req,res)=>bad(res,'Not found',404));
app.use((e,req,res,next)=>{console.error(e.message);res.status(e.status||500).json({error:e.status&&e.status<500?'Bad request':'Something went wrong'});});
init().then(()=>app.listen(E.PORT||3000,()=>console.log('CTF platform up'))).catch(e=>{console.error(e.message);process.exit(1);});
