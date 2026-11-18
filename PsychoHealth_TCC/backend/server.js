"use strict";

// Local development backend. Do not expose this server to the public internet
// until HTTPS, managed secrets, backups, and production access controls are set up.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const scrypt = promisify(crypto.scrypt);
const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "www");
const dataDir = process.env.PSYCHOHEALTH_DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "psychohealth.sqlite"));
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','professional','admin')),
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS professional_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    license_number TEXT NOT NULL,
    specialty TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS migration_imports (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    imported_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS moods (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    record_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id, date)
  );
  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS journal_user_idx ON journal_entries(user_id, updated_at);
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS self_care (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    activity_key TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, date, activity_key)
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    professional_id TEXT REFERENCES users(id),
    professional_label TEXT NOT NULL DEFAULT '',
    starts_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    modality TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'personal' CHECK(status IN ('personal','pending','confirmed','declined','cancelled')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS appointments_patient_idx ON appointments(patient_id, starts_at);
  CREATE INDEX IF NOT EXISTS appointments_professional_idx ON appointments(professional_id, starts_at);
  CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    professional_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    UNIQUE(member_id, professional_id)
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages(thread_id, created_at);
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews(status, created_at);
`);

// Additive migrations keep professional applications already in the local DB.
for (const [column, definition] of [
  ["display_name", "TEXT NOT NULL DEFAULT ''"], ["cpf", "TEXT NOT NULL DEFAULT ''"],
  ["approach", "TEXT NOT NULL DEFAULT ''"], ["availability", "TEXT NOT NULL DEFAULT ''"],
  ["session_fee", "REAL NOT NULL DEFAULT 0"], ["contact_email", "TEXT NOT NULL DEFAULT ''"]
]) {
  try { db.exec(`ALTER TABLE professional_profiles ADD COLUMN ${column} ${definition}`); }
  catch(error) { if (!String(error.message).includes("duplicate column name")) throw error; }
}

const cookieName = "psycho_session";
const sessionLifetime = 1000 * 60 * 60 * 24 * 14;
const mimeTypes = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
const authAttempts = new Map();

function json(res, status, value, extra = {}) {
  res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", ...extra });
  res.end(JSON.stringify(value));
}
function fail(res, status, message) { json(res, status, { error: message }); }
function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}
function sessionCookie(token, maxAge = Math.floor(sessionLifetime / 1000)) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "None" : "Lax";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}
function requestUser(req) {
  const token = cookieValue(req, cookieName);
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const session = db.prepare(`SELECT users.id, users.email, users.role, users.profile_json, users.created_at
    FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(hash, Date.now());
  if (!session) return null;
  return { id:session.id, email:session.email, role:session.role, profile:JSON.parse(session.profile_json), createdAt:session.created_at };
}
function requireUser(req, res) {
  const user = requestUser(req);
  if (!user) { fail(res, 401, "Entre na sua conta para continuar."); return null; }
  return user;
}
function verifySameOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === req.headers.host || origin === "https://localhost") return true;
  } catch { /* reject malformed Origin */ }
  fail(res, 403, "Origem da solicitação não permitida.");
  return false;
}
async function readJson(req, maxBytes = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Corpo da solicitação muito grande."), { status:413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON inválido."), { status:400 }); }
}
function string(value, max, field) {
  if (typeof value !== "string") throw Object.assign(new Error(`${field} é obrigatório.`), { status:400 });
  const result = value.trim();
  if (!result || result.length > max) throw Object.assign(new Error(`${field} deve ter até ${max} caracteres.`), { status:400 });
  return result;
}
function rateLimit(req, res, action) {
  const key = `${action}:${req.socket.remoteAddress || "local"}`;
  const now = Date.now();
  const recent = (authAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 8) { fail(res, 429, "Muitas tentativas. Aguarde alguns minutos e tente novamente."); return false; }
  recent.push(now); authAttempts.set(key, recent); return true;
}
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + sessionLifetime;
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(tokenHash,userId,expiresAt);
  return token;
}
async function passwordHash(password, salt) {
  return (await scrypt(password, salt, 64, { N:16384, r:8, p:1, maxmem:64*1024*1024 })).toString("hex");
}
function publicUser(user) {
  return { id:user.id, email:user.email, role:user.role, ...user.profile, createdAt:user.createdAt };
}
function parseRecordJson(value) { try { return JSON.parse(value); } catch { return null; } }
function validCpf(value) {
  const cpf=String(value||"").replace(/\D/g,"");
  if(cpf.length!==11||/^([0-9])\1{10}$/.test(cpf))return false;
  const digit=(base,factor)=>{let sum=0;for(const char of base)sum+=Number(char)*factor--;const rest=(sum*10)%11;return rest===10?0:rest;};
  return digit(cpf.slice(0,9),10)===Number(cpf[9])&&digit(cpf.slice(0,10),11)===Number(cpf[10]);
}
function sendStatic(req, res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const file = path.resolve(webRoot, `.${decoded === "/" ? "/index.html" : decoded}`);
  if (!file.startsWith(webRoot + path.sep) && file !== path.join(webRoot,"index.html")) return fail(res,403,"Caminho não permitido.");
  fs.readFile(file, (error, bytes) => {
    if (error) return fail(res,404,"Arquivo não encontrado.");
    res.writeHead(200,{"Content-Type":mimeTypes[path.extname(file)]||"application/octet-stream","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"});
    res.end(bytes);
  });
}

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const route = url.pathname;
  try {
    if (!route.startsWith("/api/")) return sendStatic(req,res,route);
    const origin = req.headers.origin;
    if (origin === "https://localhost") {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (origin !== "https://localhost") return fail(res,403,"Origem da solicitação não permitida.");
      res.writeHead(204,{"Allow":"GET,POST,PUT,PATCH,DELETE,OPTIONS"}); return res.end();
    }
    if (["POST","PUT","PATCH","DELETE"].includes(req.method) && !verifySameOrigin(req,res)) return;
    if (req.method === "GET" && route === "/api/health") return json(res,200,{ok:true,service:"psychohealth-local-api",storage:"sqlite"});

    if (req.method === "GET" && route === "/api/auth/me") {
      const user=requestUser(req); return user ? json(res,200,{user:publicUser(user)}) : fail(res,401,"Sessão ausente ou expirada.");
    }
    if (req.method === "POST" && route === "/api/auth/register") {
      if (!rateLimit(req,res,"register")) return;
      const body=await readJson(req);
      const name=string(body.name,80,"Nome");
      const email=string(body.email,254,"E-mail").toLocaleLowerCase("pt-BR");
      const password=string(body.password,200,"Senha");
      if (name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<10) return fail(res,400,"Informe nome, e-mail válido e senha com pelo menos 10 caracteres.");
      const id=crypto.randomUUID(), salt=crypto.randomBytes(16).toString("hex"), createdAt=new Date().toISOString();
      const profile={name,email,age:typeof body.age==="string"?body.age.slice(0,40):"",pronouns:typeof body.pronouns==="string"?body.pronouns.slice(0,40):"",language:typeof body.language==="string"?body.language.slice(0,20):"pt-BR",timezone:typeof body.timezone==="string"?body.timezone.slice(0,60):"America/Sao_Paulo",avatar:typeof body.avatar==="string"&&body.avatar.length<=1_500_000?body.avatar:""};
      try { db.prepare("INSERT INTO users(id,email,password_salt,password_hash,profile_json,created_at) VALUES(?,?,?,?,?,?)").run(id,email,salt,await passwordHash(password,salt),JSON.stringify(profile),createdAt); }
      catch(error) { if (String(error.message).includes("UNIQUE")) return fail(res,409,"Já existe uma conta com este e-mail."); throw error; }
      const token=await createSession(id); return json(res,201,{user:{id,email,role:"member",...profile,createdAt}},{"Set-Cookie":sessionCookie(token)});
    }
    if (req.method === "POST" && route === "/api/auth/login") {
      if (!rateLimit(req,res,"login")) return;
      const body=await readJson(req), email=string(body.email,254,"E-mail").toLocaleLowerCase("pt-BR"), password=string(body.password,200,"Senha");
      const row=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email);
      if (!row) return fail(res,401,"E-mail ou senha incorretos.");
      const actual=Buffer.from(await passwordHash(password,row.password_salt),"hex"), expected=Buffer.from(row.password_hash,"hex");
      if (actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) return fail(res,401,"E-mail ou senha incorretos.");
      const token=await createSession(row.id), user={id:row.id,email:row.email,role:row.role,profile:JSON.parse(row.profile_json),createdAt:row.created_at};
      return json(res,200,{user:publicUser(user)},{"Set-Cookie":sessionCookie(token)});
    }
    if (req.method === "POST" && route === "/api/auth/logout") {
      const token=cookieValue(req,cookieName); if(token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(crypto.createHash("sha256").update(token).digest("hex"));
      return json(res,200,{ok:true},{"Set-Cookie":sessionCookie("",0)});
    }

    const user=requireUser(req,res); if(!user) return;
    if(route==="/api/reviews"&&req.method==="GET"){
      const rows=db.prepare("SELECT id,user_id,rating,comment,status,created_at FROM reviews WHERE status='approved' OR user_id=? ORDER BY created_at DESC LIMIT 200").all(user.id);
      return json(res,200,{reviews:rows});
    }
    if(route==="/api/reviews"&&req.method==="POST"){
      const body=await readJson(req), rating=Number(body.rating), comment=string(body.comment,500,"Comentário");
      if(!Number.isInteger(rating)||rating<1||rating>5)return fail(res,400,"A nota deve ser de 1 a 5.");
      const id=crypto.randomUUID(),createdAt=new Date().toISOString();
      db.prepare("INSERT INTO reviews(id,user_id,rating,comment,created_at) VALUES(?,?,?,?,?)").run(id,user.id,rating,comment,createdAt);
      return json(res,201,{review:{id,rating,comment,status:"pending",createdAt}});
    }
    if (route === "/api/profile" && req.method === "GET") return json(res,200,{profile:publicUser(user)});
    if (route === "/api/auth/change-password" && req.method === "POST") {
      if (!rateLimit(req,res,"change-password")) return;
      const body=await readJson(req), currentPassword=string(body.currentPassword,200,"Senha atual"), newPassword=string(body.newPassword,200,"Nova senha");
      if(newPassword.length<10)return fail(res,400,"A nova senha deve ter pelo menos 10 caracteres.");
      if(newPassword===currentPassword)return fail(res,400,"Escolha uma senha diferente da atual.");
      const row=db.prepare("SELECT password_salt,password_hash FROM users WHERE id=?").get(user.id);
      const actual=Buffer.from(await passwordHash(currentPassword,row.password_salt),"hex"), expected=Buffer.from(row.password_hash,"hex");
      if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return fail(res,401,"A senha atual está incorreta.");
      const salt=crypto.randomBytes(16).toString("hex");
      db.prepare("UPDATE users SET password_salt=?,password_hash=? WHERE id=?").run(salt,await passwordHash(newPassword,salt),user.id);
      const token=cookieValue(req,cookieName), currentTokenHash=token?crypto.createHash("sha256").update(token).digest("hex"):"";
      db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(user.id,currentTokenHash);
      return json(res,200,{ok:true,message:"Senha alterada. Outras sessões foram encerradas."});
    }
    if (route === "/api/profile" && req.method === "PATCH") {
      const body=await readJson(req), current={...user.profile};
      for(const key of ["name","age","pronouns","language","timezone","avatar"]) if(body[key]!==undefined){
        if(typeof body[key]!=="string" || body[key].length>(key==="avatar"?1_500_000:120)) return fail(res,400,`Campo ${key} inválido.`);
        current[key]=body[key].trim();
      }
      if(current.name.trim().length<2) return fail(res,400,"O nome deve ter pelo menos duas letras.");
      current.email=user.email;
      db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(current),user.id);
      return json(res,200,{profile:{id:user.id,email:user.email,role:user.role,...current,createdAt:user.createdAt}});
    }

    if(route==="/api/professionals"&&req.method==="GET"){
      const rows=db.prepare(`SELECT u.id,u.profile_json,p.display_name,p.contact_email,p.approach,p.availability,p.session_fee,p.city,p.bio
        FROM professional_profiles p JOIN users u ON u.id=p.user_id
        WHERE p.verified=1 AND p.visible=1 AND u.role='professional' ORDER BY p.city,p.specialty`).all();
      return json(res,200,{professionals:rows.map(row=>{const profile=JSON.parse(row.profile_json);return{id:row.id,name:row.display_name||profile.name,email:row.contact_email||profile.email,approach:row.approach||"",specialty:row.approach||"",availability:row.availability,sessionFee:row.session_fee,city:row.city,bio:row.bio};})});
    }
    if(route==="/api/professional/application"&&req.method==="POST"){
      if(user.role!=="member")return fail(res,403,"Esta conta já tem outro papel atribuído.");
      const body=await readJson(req), license=string(body.licenseNumber,50,"Registro profissional"), displayName=string(body.name,80,"Nome"), cpf=string(body.cpf,20,"CPF").replace(/\D/g,""), contactEmail=string(body.email,254,"E-mail de contato").toLocaleLowerCase("pt-BR"), approach=string(body.approach,100,"Abordagem"), city=string(body.city,100,"Cidade"), availability=string(body.availability,1200,"Disponibilidade de horários"), bio=string(body.bio,1200,"Apresentação"), sessionFee=Number(body.sessionFee);
      if(!validCpf(cpf))return fail(res,400,"Informe um CPF válido.");
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))return fail(res,400,"Informe um e-mail válido.");
      if(!Number.isFinite(sessionFee)||sessionFee<0||sessionFee>100000)return fail(res,400,"Informe um valor por sessão válido.");
      const now=new Date().toISOString();
      db.prepare(`INSERT INTO professional_profiles(user_id,license_number,specialty,city,bio,verified,visible,created_at,display_name,cpf,approach,availability,session_fee,contact_email) VALUES(?,?,?,?,?,0,0,?,?,?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET license_number=excluded.license_number,specialty=excluded.specialty,city=excluded.city,bio=excluded.bio,verified=0,visible=0,display_name=excluded.display_name,cpf=excluded.cpf,approach=excluded.approach,availability=excluded.availability,session_fee=excluded.session_fee,contact_email=excluded.contact_email`).run(user.id,license,approach,city,bio,now,displayName,cpf,approach,availability,sessionFee,contactEmail);
      return json(res,202,{status:"pending_verification",message:"Candidatura salva. O perfil não será exibido até a verificação manual."});
    }
    if(route==="/api/admin/reviews"&&req.method==="GET"){
      const key=process.env.ADMIN_API_KEY||"", supplied=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      const a=Buffer.from(supplied),b=Buffer.from(key);
      if(!key||a.length!==b.length||!crypto.timingSafeEqual(a,b))return fail(res,403,"Acesso administrativo negado.");
      return json(res,200,{reviews:db.prepare("SELECT id,user_id,rating,comment,status,created_at FROM reviews ORDER BY created_at DESC").all()});
    }
    if(route==="/api/admin/reviews/moderate"&&req.method==="POST"){
      const key=process.env.ADMIN_API_KEY||"", supplied=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      const a=Buffer.from(supplied),b=Buffer.from(key);
      if(!key||a.length!==b.length||!crypto.timingSafeEqual(a,b))return fail(res,403,"Acesso administrativo negado.");
      const body=await readJson(req), id=string(body.id,80,"ID da avaliação"), status=["approved","rejected"].includes(body.status)?body.status:"";
      if(!status)return fail(res,400,"Estado de moderação inválido.");
      const result=db.prepare("UPDATE reviews SET status=? WHERE id=?").run(status,id);
      return result.changes?json(res,200,{ok:true}):fail(res,404,"Avaliação não encontrada.");
    }
    if(route==="/api/admin/professionals/verify"&&req.method==="POST"){
      const key=process.env.ADMIN_API_KEY||"", supplied=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      if(!key)return fail(res,503,"Verificação administrativa não configurada neste servidor.");
      const a=Buffer.from(supplied),b=Buffer.from(key);
      if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return fail(res,403,"Acesso administrativo negado.");
      const body=await readJson(req), id=string(body.userId,80,"ID do usuário");
      const result=db.prepare("UPDATE professional_profiles SET verified=1,visible=1 WHERE user_id=?").run(id);
      if(!result.changes)return fail(res,404,"Candidatura não encontrada.");
      db.prepare("UPDATE users SET role='professional' WHERE id=?").run(id);
      return json(res,200,{ok:true});
    }
    if(route==="/api/admin/professionals/pending"&&req.method==="GET"){
      const key=process.env.ADMIN_API_KEY||"", supplied=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      const a=Buffer.from(supplied),b=Buffer.from(key);
      if(!key||a.length!==b.length||!crypto.timingSafeEqual(a,b))return fail(res,403,"Acesso administrativo negado.");
      const rows=db.prepare(`SELECT u.id,u.email,u.profile_json,p.license_number,p.cpf,p.display_name,p.contact_email,p.approach,p.availability,p.session_fee,p.city,p.bio,p.created_at
        FROM professional_profiles p JOIN users u ON u.id=p.user_id WHERE p.verified=0 ORDER BY p.created_at`).all();
      return json(res,200,{applications:rows.map(row=>({userId:row.id,email:row.contact_email||row.email,name:row.display_name||JSON.parse(row.profile_json).name,cpf:row.cpf,licenseNumber:row.license_number,approach:row.approach||row.specialty,availability:row.availability,sessionFee:row.session_fee,city:row.city,bio:row.bio,createdAt:row.created_at}))});
    }

    if(route==="/api/migrate-local"&&req.method==="POST"){
      const already=db.prepare("SELECT 1 FROM migration_imports WHERE user_id=?").get(user.id);
      if(already)return json(res,200,{ok:true,alreadyImported:true});
      const body=await readJson(req);
      const moods=Array.isArray(body.moods)?body.moods.slice(0,1000):[];
      const entries=Array.isArray(body.entries)?body.entries.slice(0,1000):[];
      const goals=Array.isArray(body.goals)?body.goals.slice(0,500):[];
      const appointments=Array.isArray(body.appointments)?body.appointments.slice(0,500):[];
      const selfCare=body.selfCare&&typeof body.selfCare==="object"?body.selfCare:{};
      db.exec("BEGIN IMMEDIATE");
      try{
        for(const item of moods){if(!item||!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||""))||typeof item.mood!=="string")continue;const record={...item,date:String(item.date),updatedAt:item.updatedAt||new Date().toISOString()};db.prepare("INSERT INTO moods(user_id,date,record_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,date) DO NOTHING").run(user.id,record.date,JSON.stringify(record),record.updatedAt);}
        for(const item of entries){if(!item||typeof item.text!=="string"||!item.text.trim())continue;const id=typeof item.id==="string"&&item.id.length<80?item.id:crypto.randomUUID(),now=item.updatedAt||item.createdAt||new Date().toISOString(),entry={...item,id,text:item.text.slice(0,3000),updatedAt:now};db.prepare("INSERT INTO journal_entries(id,user_id,entry_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING").run(id,user.id,JSON.stringify(entry),now);}
        for(const item of goals){if(!item||typeof item.title!=="string"||!item.title.trim())continue;const id=typeof item.id==="string"&&item.id.length<80?item.id:crypto.randomUUID(),now=item.updatedAt||new Date().toISOString(),goal={...item,id,updatedAt:now};db.prepare("INSERT INTO goals(id,user_id,goal_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING").run(id,user.id,JSON.stringify(goal),now);}
        for(const item of appointments){if(!item||!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||""))||!/^\d{2}:\d{2}$/.test(String(item.time||"")))continue;const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare("INSERT INTO appointments(id,patient_id,professional_label,starts_at,duration_minutes,modality,note,status,created_at) VALUES(?,?,?,?,?,?,?,'personal',?)").run(id,user.id,String(item.psychologist||"Consulta").slice(0,100),`${item.date}T${item.time}`,Number(item.duration)||45,String(item.mode||"Online").slice(0,40),String(item.note||"").slice(0,300),now);}
        const careInsert=db.prepare("INSERT INTO self_care(user_id,date,activity_key,done) VALUES(?,?,?,?) ON CONFLICT(user_id,date,activity_key) DO NOTHING");
        for(const [date,activities] of Object.entries(selfCare)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!activities||typeof activities!=="object")continue;for(const [key,done] of Object.entries(activities))careInsert.run(user.id,date,key.slice(0,40),done?1:0);}
        db.prepare("INSERT INTO migration_imports(user_id,imported_at) VALUES(?,?)").run(user.id,new Date().toISOString());
        db.exec("COMMIT");
      }catch(error){db.exec("ROLLBACK");throw error;}
      return json(res,200,{ok:true,imported:{moods:moods.length,entries:entries.length,goals:goals.length,appointments:appointments.length}});
    }

    if (route === "/api/moods" && req.method === "GET") {
      const rows=db.prepare("SELECT record_json FROM moods WHERE user_id=? ORDER BY date DESC LIMIT 1000").all(user.id);
      return json(res,200,{records:rows.map(row=>parseRecordJson(row.record_json)).filter(Boolean)});
    }
    if (route === "/api/moods" && req.method === "PUT") {
      const body=await readJson(req), date=string(body.date,10,"Data");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res,400,"Data inválida.");
      const record={date,mood:string(body.mood,60,"Humor"),note:typeof body.note==="string"?body.note.slice(0,500):"",energy:typeof body.energy==="string"?body.energy.slice(0,40):"Moderada",help:typeof body.help==="string"?body.help.slice(0,300):"",emotions:Array.isArray(body.emotions)?body.emotions.slice(0,12).map(x=>String(x).slice(0,40)):[],stress:Math.max(1,Math.min(5,Number(body.stress)||3)),sleep:typeof body.sleep==="string"?body.sleep.slice(0,20):"",updatedAt:new Date().toISOString()};
      db.prepare(`INSERT INTO moods(user_id,date,record_json,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id,date) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at`).run(user.id,date,JSON.stringify(record),record.updatedAt);
      return json(res,200,{record});
    }
    const moodMatch=route.match(/^\/api\/moods\/(\d{4}-\d{2}-\d{2})$/);
    if(moodMatch && req.method==="DELETE"){db.prepare("DELETE FROM moods WHERE user_id=? AND date=?").run(user.id,moodMatch[1]);return json(res,200,{ok:true});}

    if(route==="/api/journal" && req.method==="GET"){
      const rows=db.prepare("SELECT entry_json FROM journal_entries WHERE user_id=? ORDER BY updated_at DESC LIMIT 1000").all(user.id);
      return json(res,200,{entries:rows.map(row=>parseRecordJson(row.entry_json)).filter(Boolean)});
    }
    if(route==="/api/journal" && req.method==="POST"){
      const body=await readJson(req), id=typeof body.id==="string"&&body.id.length<80?body.id:crypto.randomUUID(), now=new Date().toISOString();
      const entry={id,title:typeof body.title==="string"?body.title.trim().slice(0,100):"",text:string(body.text,3000,"Texto"),createdAt:typeof body.createdAt==="string"?body.createdAt:now,updatedAt:now};
      db.prepare(`INSERT INTO journal_entries(id,user_id,entry_json,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET entry_json=excluded.entry_json,updated_at=excluded.updated_at WHERE journal_entries.user_id=excluded.user_id`).run(id,user.id,JSON.stringify(entry),now);
      const saved=db.prepare("SELECT user_id FROM journal_entries WHERE id=?").get(id); if(saved?.user_id!==user.id)return fail(res,404,"Registro não encontrado.");
      return json(res,200,{entry});
    }
    const journalMatch=route.match(/^\/api\/journal\/([\w-]+)$/);
    if(journalMatch&&req.method==="DELETE"){db.prepare("DELETE FROM journal_entries WHERE id=? AND user_id=?").run(journalMatch[1],user.id);return json(res,200,{ok:true});}
    if(route==="/api/journal"&&req.method==="DELETE"){db.prepare("DELETE FROM journal_entries WHERE user_id=?").run(user.id);return json(res,200,{ok:true});}

    if(route==="/api/goals"&&req.method==="GET"){
      const rows=db.prepare("SELECT goal_json FROM goals WHERE user_id=? ORDER BY updated_at DESC").all(user.id);
      return json(res,200,{goals:rows.map(row=>parseRecordJson(row.goal_json)).filter(Boolean)});
    }
    if(route==="/api/goals"&&req.method==="POST"){
      const body=await readJson(req), id=typeof body.id==="string"?body.id:crypto.randomUUID(), goal={...body,id,title:string(body.title,100,"Meta"),description:typeof body.description==="string"?body.description.slice(0,500):"",updatedAt:new Date().toISOString()};
      db.prepare("INSERT INTO goals(id,user_id,goal_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET goal_json=excluded.goal_json,updated_at=excluded.updated_at WHERE goals.user_id=excluded.user_id").run(id,user.id,JSON.stringify(goal),goal.updatedAt);
      return json(res,200,{goal});
    }
    const goalMatch=route.match(/^\/api\/goals\/([\w-]+)$/);
    if(goalMatch&&req.method==="DELETE"){db.prepare("DELETE FROM goals WHERE id=? AND user_id=?").run(goalMatch[1],user.id);return json(res,200,{ok:true});}

    if(route==="/api/self-care"&&req.method==="GET"){
      const rows=db.prepare("SELECT date,activity_key,done FROM self_care WHERE user_id=? ORDER BY date DESC").all(user.id);
      return json(res,200,{records:rows});
    }
    if(route==="/api/self-care"&&req.method==="PUT"){
      const body=await readJson(req), date=string(body.date,10,"Data"), key=string(body.activityKey,40,"Atividade"), done=body.done?1:0;
      db.prepare("INSERT INTO self_care(user_id,date,activity_key,done) VALUES(?,?,?,?) ON CONFLICT(user_id,date,activity_key) DO UPDATE SET done=excluded.done").run(user.id,date,key,done);
      return json(res,200,{date,activityKey:key,done:Boolean(done)});
    }

    // Calendar entries are saved as personal reminders only. Actual booking requires
    // a verified professional account and their availability.
    if(route==="/api/appointments"&&req.method==="GET"){
      const rows=db.prepare(`SELECT a.id,a.patient_id,a.professional_id,a.professional_label,a.starts_at,a.duration_minutes,a.modality,a.note,a.status,a.created_at,u.profile_json AS professional_profile,p.profile_json AS patient_profile
        FROM appointments a LEFT JOIN users u ON u.id=a.professional_id JOIN users p ON p.id=a.patient_id WHERE a.patient_id=? OR a.professional_id=? ORDER BY a.starts_at`).all(user.id,user.id);
      return json(res,200,{appointments:rows.map(row=>({...row,professional:row.professional_profile?JSON.parse(row.professional_profile):null,patient:JSON.parse(row.patient_profile)}))});
    }
    if(route==="/api/appointments"&&req.method==="POST"){
      if(user.role!=="member")return fail(res,403,"Somente perfis de usuário podem criar consultas.");
      const body=await readJson(req), date=string(body.date,10,"Data"), time=string(body.time,5,"Horário"), duration=Math.max(15,Math.min(180,Number(body.duration)||45));
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return fail(res,400,"Data ou horário inválido.");
      let professional=null,status="personal",label=typeof body.professionalName==="string"?body.professionalName.slice(0,100):"Lembrete pessoal";
      if(body.professionalId){professional=db.prepare("SELECT u.id FROM users u JOIN professional_profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='professional' AND p.verified=1 AND p.visible=1").get(String(body.professionalId));if(!professional)return fail(res,404,"Profissional não encontrado ou indisponível.");status="pending";label="";}
      const startsAt=`${date}T${time}`, id=crypto.randomUUID(), now=new Date().toISOString();
      if(professional){const conflicts=db.prepare(`SELECT starts_at,duration_minutes FROM appointments WHERE professional_id=? AND status IN ('pending','confirmed') AND starts_at < ?`).all(professional.id,`${date}T23:59`);const start=Date.parse(startsAt);if(conflicts.some(row=>Math.abs(start-Date.parse(row.starts_at))<Math.max(duration,Number(row.duration_minutes))))return fail(res,409,"Este horário está ocupado ou aguardando confirmação.");}
      db.prepare("INSERT INTO appointments(id,patient_id,professional_id,professional_label,starts_at,duration_minutes,modality,note,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,user.id,professional?.id||null,label,startsAt,duration,String(body.modality||"Online").slice(0,40),String(body.note||"").slice(0,300),status,now);
      return json(res,201,{appointment:{id,patient_id:user.id,professional_id:professional?.id||null,professional_label:label,starts_at:startsAt,duration_minutes:duration,modality:body.modality||"Online",note:body.note||"",status,created_at:now}});
    }
    const appointmentMatch=route.match(/^\/api\/appointments\/([\w-]+)$/);
    if(appointmentMatch&&req.method==="PATCH"){
      const item=db.prepare("SELECT * FROM appointments WHERE id=? AND (patient_id=? OR professional_id=?)").get(appointmentMatch[1],user.id,user.id);
      if(!item)return fail(res,404,"Consulta não encontrada.");const body=await readJson(req);
      if(body.status==="cancelled")db.prepare("UPDATE appointments SET status='cancelled' WHERE id=? AND (patient_id=? OR professional_id=?)").run(item.id,user.id,user.id);
      else if(body.status==="confirmed"&&item.professional_id===user.id&&user.role==="professional")db.prepare("UPDATE appointments SET status='confirmed' WHERE id=?").run(item.id);
      else if(item.patient_id===user.id&&item.status==="personal"&&body.date&&body.time){
        const date=string(body.date,10,"Data"),time=string(body.time,5,"Horário"),duration=Math.max(15,Math.min(180,Number(body.duration)||45));
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return fail(res,400,"Data ou horário inválido.");
        db.prepare("UPDATE appointments SET professional_label=?,starts_at=?,duration_minutes=?,modality=?,note=? WHERE id=? AND patient_id=? AND status='personal'").run(String(body.professionalName||"Lembrete pessoal").slice(0,100),`${date}T${time}`,duration,String(body.modality||"Online").slice(0,40),String(body.note||"").slice(0,300),item.id,user.id);
      }
      else return fail(res,403,"Esta alteração não está permitida para sua conta.");
      return json(res,200,{ok:true});
    }
    if(appointmentMatch&&req.method==="DELETE"){db.prepare("DELETE FROM appointments WHERE id=? AND patient_id=? AND status='personal'").run(appointmentMatch[1],user.id);return json(res,200,{ok:true});}

    if(route==="/api/chats"&&req.method==="GET"){
      const rows=db.prepare(`SELECT t.id,t.member_id,t.created_at,u.id AS professional_id,u.email AS professional_email,u.profile_json AS professional_profile,m.profile_json AS member_profile
        FROM chat_threads t JOIN users u ON u.id=t.professional_id JOIN users m ON m.id=t.member_id WHERE t.member_id=? OR t.professional_id=? ORDER BY t.created_at DESC`).all(user.id,user.id);
      return json(res,200,{threads:rows.map(row=>{const prof={id:row.professional_id,email:row.professional_email,...JSON.parse(row.professional_profile)},member={id:row.member_id,...JSON.parse(row.member_profile)};return{id:row.id,createdAt:row.created_at,professional:prof,counterpart:user.id===row.member_id?prof:member};})});
    }
    if(route==="/api/chats"&&req.method==="POST"){
      if(user.role!=="member")return fail(res,403,"Somente perfis de usuário podem iniciar uma conversa.");
      const body=await readJson(req), email=string(body.professionalEmail,254,"E-mail do profissional").toLocaleLowerCase("pt-BR");
      const professional=db.prepare("SELECT u.id,u.role FROM users u JOIN professional_profiles p ON p.user_id=u.id WHERE (u.email=? COLLATE NOCASE OR p.contact_email=? COLLATE NOCASE) AND p.verified=1 AND p.visible=1").get(email,email);
      if(!professional||professional.role!=="professional")return fail(res,404,"Profissional não encontrado ou ainda não verificado.");
      const id=crypto.randomUUID(), createdAt=new Date().toISOString();
      db.prepare("INSERT INTO chat_threads(id,member_id,professional_id,created_at) VALUES(?,?,?,?) ON CONFLICT(member_id,professional_id) DO NOTHING").run(id,user.id,professional.id,createdAt);
      const thread=db.prepare("SELECT id,created_at FROM chat_threads WHERE member_id=? AND professional_id=?").get(user.id,professional.id);
      return json(res,201,{thread});
    }
    const chatMatch=route.match(/^\/api\/chats\/([\w-]+)\/messages$/);
    if(chatMatch&&req.method==="GET"){
      const thread=db.prepare("SELECT * FROM chat_threads WHERE id=? AND (member_id=? OR professional_id=?)").get(chatMatch[1],user.id,user.id);
      if(!thread)return fail(res,404,"Conversa não encontrada.");
      const messages=db.prepare("SELECT id,sender_id,body,created_at FROM chat_messages WHERE thread_id=? ORDER BY created_at LIMIT 500").all(thread.id);
      return json(res,200,{messages});
    }
    if(chatMatch&&req.method==="POST"){
      const thread=db.prepare("SELECT * FROM chat_threads WHERE id=? AND (member_id=? OR professional_id=?)").get(chatMatch[1],user.id,user.id);
      if(!thread)return fail(res,404,"Conversa não encontrada.");
      const body=await readJson(req), text=string(body.text,2000,"Mensagem"), id=crypto.randomUUID(), createdAt=new Date().toISOString();
      db.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,body,created_at) VALUES(?,?,?,?,?)").run(id,thread.id,user.id,text,createdAt);
      return json(res,201,{message:{id,senderId:user.id,body:text,createdAt}});
    }

    return fail(res,404,"Rota da API não encontrada.");
  } catch(error) {
    console.error("API error:",error.message);
    return fail(res,error.status||500,error.status?error.message:"Erro interno. Tente novamente.");
  }
});

const port=Number(process.env.PORT)||4173;
const host=process.env.HOST||"127.0.0.1";
server.listen(port,host,()=>console.log(`PsychoHealth API/local web: http://${host}:${port}`));
process.on("SIGINT",()=>{db.close();server.close(()=>process.exit(0));});
process.on("SIGTERM",()=>{db.close();server.close(()=>process.exit(0));});
