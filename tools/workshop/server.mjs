// Card Workshop, local edition.
//
// Serves the workshop page on your own computer and lets it save into this project's content/ folder and publish with your
// own git login: the same page as the Claude artifact, minus the need to install anything.
//
// Safety, because this can write files and run git:
//   * listens on 127.0.0.1 only, and rejects any request whose Host or Origin isn't this server (blocks other websites and DNS tricks);
//   * every request needs a random token that exists only in the link this program opens for you (it changes every start);
//   * it can only read, write or recycle files inside <project>/content, and never follows a link out of the project;
//   * it only ever runs this short list of git / gh commands (no shell involved), always inside the project folder.
//
// Start it with "Card Workshop.cmd" (double-click) or: npm run workshop
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ROOT = fs.realpathSync(path.resolve(opt('--root') || path.join(here, '..', '..')));
const CONTENT = path.join(ROOT, 'content');
const PORT0 = Number(opt('--port') || 4300);
const NO_OPEN = args.includes('--no-open');
const TOKEN = crypto.randomBytes(24).toString('hex');

if (!fs.existsSync(path.join(CONTENT, 'cards')) || !fs.existsSync(path.join(ROOT, '.git'))) {
  console.error(`\n  This doesn't look like the game's project folder:\n  ${ROOT}\n  (it needs a content/cards folder and a .git folder)\n`);
  process.exit(1);
}

/* ---------- path safety ---------- */
const within = (p, base) => { const r = path.relative(base, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const fail = (code, msg) => Object.assign(new Error(`${code}: ${msg}`), { code });
/** Resolve a path from the page and prove it stays inside `base`, even through symlinks (the deepest existing part is resolved). */
function safe(p, base) {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw fail('EINVAL', 'bad path');
  let abs = path.resolve(p), tail = '';
  while (!fs.existsSync(abs)) { const up = path.dirname(abs); if (up === abs) break; tail = path.join(path.basename(abs), tail); abs = up; }
  const real = path.join(fs.realpathSync(abs), tail);
  if (!within(real, base)) throw fail('EPERM', 'outside the allowed folder');
  return real;
}
const readable = p => safe(p, CONTENT);
const writable = p => { const r = safe(p, CONTENT); if (r === CONTENT) throw fail('EPERM', 'not the content folder itself'); return r; };

/* ---------- the only commands that may run ---------- */
const FIXED = {
  'git remote get-url origin': ['git', 'remote', 'get-url', 'origin'],
  'git -c core.quotepath=off status --porcelain -uall -- content': ['git', '-c', 'core.quotepath=off', 'status', '--porcelain', '-uall', '--', 'content'],
  'git add -A -- content': ['git', 'add', '-A', '--', 'content'],
  'git config user.name': ['git', 'config', 'user.name'],
  'git config user.email': ['git', 'config', 'user.email'],
  'git commit -F -': ['git', 'commit', '-F', '-'],
  'git pull --rebase --autostash': ['git', 'pull', '--rebase', '--autostash'],
  'git push': ['git', 'push'],
  'git rev-parse HEAD': ['git', 'rev-parse', 'HEAD'],
};
function plan(cmd) {
  if (typeof cmd !== 'string') return null;
  if (FIXED[cmd]) return FIXED[cmd];
  let m;
  if ((m = /^git -c user\.name="([\w .@-]{1,60})" -c user\.email="([\w.+@-]{1,80})" commit -F -$/.exec(cmd)))
    return ['git', '-c', `user.name=${m[1]}`, '-c', `user.email=${m[2]}`, 'commit', '-F', '-'];
  if ((m = /^gh run list --repo ([\w.-]+\/[\w.-]+) --limit (\d{1,2}) --json (status,conclusion,headSha)$/.exec(cmd)))
    return ['gh', 'run', 'list', '--repo', m[1], '--limit', m[2], '--json', m[3]];
  return null;
}
function run(argv, input, timeoutMs, extraEnv) {
  return new Promise(resolve => {
    let out = '', err = '', done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    let child;
    try { child = spawn(argv[0], argv.slice(1), { cwd: ROOT, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(extraEnv || {}) } }); }
    catch (e) { return finish({ stdout: '', stderr: String(e.message), code: 127, signal: null, truncated: false }); }
    const timer = setTimeout(() => child.kill(), Math.min(timeoutMs || 120000, 180000));
    child.stdout.on('data', d => { if (out.length < 1e6) out += d; });
    child.stderr.on('data', d => { if (err.length < 1e6) err += d; });
    child.on('error', e => { clearTimeout(timer); finish({ stdout: out, stderr: e.code === 'ENOENT' ? `${argv[0]} is not installed or not on the PATH` : String(e.message), code: 127, signal: null, truncated: false }); });
    child.on('close', (code, signal) => { clearTimeout(timer); finish({ stdout: out, stderr: err, code, signal, truncated: false }); });
    child.stdin.on('error', () => {});
    if (input != null) child.stdin.write(String(input)); child.stdin.end();
  });
}

/* ---------- what the page may ask for ---------- */
const methods = {
  homedir: () => os.homedir(),
  exists: p => { try { const abs = path.resolve(p); return within(fs.realpathSync(abs), ROOT) && fs.existsSync(abs); } catch { return false; } },   // yes/no only
  readdir: p => fs.readdirSync(readable(p), { withFileTypes: true }).map(d => ({ name: d.name, isFile: d.isFile(), isDirectory: d.isDirectory(), isSymbolicLink: d.isSymbolicLink() })),
  readFile: (p, enc) => { const f = readable(p); if (fs.statSync(f).size > 20e6) throw fail('EFBIG', 'file too large'); return fs.readFileSync(f).toString(enc === 'base64' ? 'base64' : 'utf8'); },
  writeFile: (p, data, enc) => {
    if (typeof data !== 'string') throw fail('EINVAL', 'bad data');
    const buf = enc === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8');
    if (buf.length > 12e6) throw fail('EFBIG', 'file too large');
    fs.writeFileSync(writable(p), buf);
  },
  mkdir: (p, o) => { fs.mkdirSync(writable(p), { recursive: !!(o && o.recursive) }); },
  trash: async p => {
    const f = writable(p);
    if (!fs.statSync(f).isFile()) throw fail('EISDIR', 'only files can be removed');
    if (process.platform === 'win32') {
      const r = await run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:WS_TRASH_PATH,'OnlyErrorDialogs','SendToRecycleBin')"], null, 30000, { WS_TRASH_PATH: f });
      if (r.code) throw fail('EIO', (r.stderr || 'could not move it to the Recycle Bin').trim().slice(0, 200));
    } else { fs.mkdirSync(path.join(ROOT, '.workshop-trash'), { recursive: true }); fs.renameSync(f, path.join(ROOT, '.workshop-trash', `${Date.now()}-${path.basename(f)}`)); }
  },
  reveal: p => { const d = safe(p, ROOT); const target = fs.statSync(d).isDirectory() ? d : path.dirname(d);
    const [cmd, a] = process.platform === 'win32' ? ['explorer.exe', [target]] : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
    spawn(cmd, a, { detached: true, stdio: 'ignore' }).unref(); },
  exec: async (cmd, o) => {
    const argv = plan(cmd);
    if (!argv) return { stdout: '', stderr: `The workshop isn't allowed to run: ${String(cmd).slice(0, 80)}`, code: 126, signal: null, truncated: false };
    return run(argv, o && o.input, o && o.timeout);
  },
};
/* ---------- the page + a stand-in for Claude's desktop API ---------- */
const SHIM = root => `<script>(function(){
  var h=new URLSearchParams(location.hash.slice(1)),t=h.get('t');
  try{ if(t) sessionStorage.setItem('ws-token',t); else t=sessionStorage.getItem('ws-token'); }catch(e){}
  if(h.has('t')) history.replaceState(null,'',location.pathname+location.search);
  window.WORKSHOP_ROOT=${JSON.stringify(root)};
  var rpc=function(m){var a=[].slice.call(arguments,1);return fetch('/rpc',{method:'POST',headers:{'content-type':'application/json','x-workshop-token':t||''},body:JSON.stringify({m:m,a:a})})
    .then(function(r){return r.json();}).then(function(j){ if(j.err) throw new Error(j.err); return j.v; });};
  var noop=function(){return Promise.resolve();};
  var desktop={
    install:{state:function(){return Promise.resolve('installed');},request:function(){return Promise.resolve('installed');}},
    permissions:{state:function(){return Promise.resolve('granted');},request:function(){return Promise.resolve({'full-access':'granted'});},manage:noop},
    app:{dock:{setIcon:function(){return Promise.resolve({written:false});}}}, window:{},
    os:{homedir:function(){return rpc('homedir');},platform:function(){return Promise.resolve(${JSON.stringify(process.platform)});}},
    fs:{readdir:function(p){return rpc('readdir',p);},readFile:function(p,e){return rpc('readFile',p,e);},writeFile:function(p,d,e){return rpc('writeFile',p,d,e);},
        exists:function(p){return rpc('exists',p);},mkdir:function(p,o){return rpc('mkdir',p,o);}},
    childProcess:{exec:function(c,o){return rpc('exec',c,{input:o&&o.input,timeout:o&&o.timeout});}},
    shell:{trashItem:function(p){return rpc('trash',p);},showItemInFolder:function(p){return rpc('reveal',p);}}
  };
  window.claude={use:function(n){return Promise.resolve(n==='desktop'?desktop:null);}};
})();</script>`;

/* ---------- http ---------- */
let PORT = PORT0;
const hostOk = h => h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}`;
const originOk = o => !o || o === `http://127.0.0.1:${PORT}` || o === `http://localhost:${PORT}`;
const rootFwd = ROOT.replace(/\\/g, '/');
const server = http.createServer((req, res) => {
  if (!hostOk(req.headers.host)) { res.writeHead(403); res.end('forbidden'); return; }
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    const page = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + SHIM(rootFwd) + page); return;
  }
  if (req.method === 'POST' && req.url === '/rpc') {
    if (req.headers['x-workshop-token'] !== TOKEN || !originOk(req.headers.origin)) { res.writeHead(403); res.end('forbidden'); return; }
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 16e6) req.destroy(); else chunks.push(c); });
    req.on('end', async () => {
      const send = o => { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
      try {
        const { m, a } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Object.prototype.hasOwnProperty.call(methods, m) || !Array.isArray(a)) throw fail('EINVAL', 'unknown request');
        send({ v: await methods[m](...a) });
      } catch (e) { send({ err: String(e && e.message || e).slice(0, 500) }); }
    });
    return;
  }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(404); res.end('not found');
});

function listen(port) {
  PORT = port;
  server.once('error', e => { if (e.code === 'EADDRINUSE' && port < PORT0 + 9) listen(port + 1); else { console.error('Could not start:', e.message); process.exit(1); } });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/#t=${TOKEN}`;
    console.log(`\n  Card Workshop is running for:\n    ${ROOT}\n\n  Open it here (this link only works on this computer, and only until you close this window):\n    ${url}\n\n  Keep this window open while you work. Press Ctrl+C to stop.\n`);
    if (!NO_OPEN) {
      const [cmd, a] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      try { spawn(cmd, a, { detached: true, stdio: 'ignore' }).unref(); } catch { /* the link above still works */ }
    }
  });
}
listen(PORT0);
