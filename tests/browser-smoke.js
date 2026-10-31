/* Headless-browser smoke test: boots index.html in Edge/Chrome over CDP,
   plays a few turns, checks persistence + i18n, and writes screenshots.
   Run:  node tests/browser-smoke.js                                            */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGES = [
  process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env['PROGRAMFILES'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe'
].filter((p) => p && fs.existsSync(p));

if (!EDGES.length) { console.log('NO_BROWSER'); process.exit(2); }

const PORT = 9347;
const PROFILE = path.join(os.tmpdir(), 'ember-spire-cdp-profile');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const html = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

const proc = spawn(EDGES[0], [
  '--headless=new', '--remote-allow-origins=*', '--disable-gpu', '--disable-dev-shm-usage',
  '--mute-audio', '--no-first-run', '--window-size=430,820',
  '--user-data-dir=' + PROFILE, '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, html
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const pageErrors = [];
function check(cond, label) {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) problems.push(label);
}

let ws, msgId = 0;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(params ? { id, method, params } : { id, method }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const detail = (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text;
    pageErrors.push('eval failed: ' + detail + '  «' + expression.slice(0, 90) + '»');
    return undefined;
  }
  return r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  shot ' + name + '.png');
}

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('file://') && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) { /* browser still starting */ }
    await sleep(500);
  }
  return null;
}

(async function main() {
  const target = await findTarget();
  if (!target) { console.log('FAIL: no CDP target'); proc.kill('SIGKILL'); process.exit(1); }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const obj = JSON.parse(ev.data);
    if (obj.id && pending.has(obj.id)) {
      const p = pending.get(obj.id);
      pending.delete(obj.id);
      if (obj.error) p.reject(new Error(JSON.stringify(obj.error))); else p.resolve(obj.result);
    } else if (obj.method === 'Runtime.exceptionThrown') {
      const d = obj.params.exceptionDetails;
      pageErrors.push('uncaught: ' + (d.exception && d.exception.description || d.text));
    } else if (obj.method === 'Runtime.consoleAPICalled' && (obj.params.type === 'error' || obj.params.type === 'warning')) {
      pageErrors.push('console.' + obj.params.type + ': ' + obj.params.args.map((a) => a.value || a.description).join(' '));
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(1200);

  console.log('\n--- boot ---');
  check(await evaluate('!!window.EmberSpire && !!window.I18N && !!window.Dungeon'), 'scripts loaded');
  check((await evaluate('Sprites.verify()')).length === 0, 'sprite maps valid in the browser');
  check(await evaluate('!document.getElementById("screen-title").classList.contains("hidden")'), 'title screen is showing');
  const fontOk = await evaluate(`document.fonts.ready.then(() => document.fonts.check('700 16px "Zen Maru Gothic"'))`);
  const fontStack = await evaluate(`getComputedStyle(document.body).fontFamily`);
  console.log('  info webfont: ' + (fontOk === true ? 'Google Fonts loaded' : 'offline — using system fallbacks'));
  console.log('  info stack: ' + String(fontStack).slice(0, 90));
  check(fontOk === true || /Hiragino|Yu Gothic|YaHei|PingFang|system-ui|sans-serif/.test(String(fontStack)),
    'text has a CJK-capable fallback when the webfont is unavailable');
  await shot('01-title-ja');

  console.log('\n--- i18n ---');
  for (const lang of ['en', 'zh', 'ja']) {
    await evaluate('EmberSpire.setLang("' + lang + '")');
    const label = await evaluate('document.querySelector(\'[data-i18n="btn.skill"]\').textContent');
    const want = { en: 'Fire Bolt', zh: '火球术', ja: '火の玉' }[lang];
    check(label === want, lang + ': skill button reads "' + label + '"');
  }
  await evaluate('EmberSpire.setLang("ja")');

  console.log('\n--- play a run ---');
  await evaluate('EmberSpire.newRun()');
  await sleep(400);
  let st = await evaluate('(()=>{const S=EmberSpire.state();return {floor:S.floor,mon:S.mon.length,items:S.items.length,hp:S.p.hp,w:S.w,h:S.h};})()');
  check(st && st.floor === 1 && st.mon > 0 && st.items > 3, 'floor 1 generated: ' + JSON.stringify(st));
  check(st.w >= 19 && st.h >= 25, 'map is portrait-sized: ' + st.w + 'x' + st.h);
  await shot('02-play-ja');

  // wall bump should not spend a turn; illegal multi-tile steps are refused
  const before = await evaluate('EmberSpire.state().turn');
  await evaluate('(()=>{const S=EmberSpire.state();const D=[[0,-1],[1,0],[0,1],[-1,0]];for(const d of D){const row=S.tiles[S.p.y+d[1]];if(row&&row[S.p.x+d[0]]==="#"){EmberSpire.tryMove(d[0],d[1]);break;}}})()');
  const afterBump = await evaluate('EmberSpire.state().turn');
  check(before === afterBump, 'bumping into a wall costs no turn');
  check(await evaluate('EmberSpire.tryMove(-9,0)') === false, 'a 9-tile "step" is refused');

  // wander: 60 mixed moves (topped up so a blind walk does not end the run early)
  await evaluate('(()=>{const D=[[0,-1],[1,0],[0,1],[-1,0]];for(let i=0;i<60;i++){const S=EmberSpire.state();if(S.p.hp<=0)break;if(i%8===0)S.p.hp=S.p.maxhp;const d=D[(i*7)%4];EmberSpire.tryMove(d[0],d[1]);}})()');
  st = await evaluate('(()=>{const S=EmberSpire.state();return {turn:S.turn,x:S.p.x,y:S.p.y,hp:S.p.hp,gold:S.p.gold,lvl:S.p.lvl};})()');
  check(st.turn > 0, 'turns advance while walking: ' + JSON.stringify(st));
  await shot('03-walk');

  // actions
  await evaluate('EmberSpire.rest(); EmberSpire.castBolt(); EmberSpire.quaff();');
  st = await evaluate('(()=>{const S=EmberSpire.state();return {mp:S.p.mp,potions:S.p.potions};})()');
  check(st.mp >= 0 && st.potions >= 0, 'rest / bolt / potion run without breaking: ' + JSON.stringify(st));

  console.log('\n--- touch input on the board ---');
  await evaluate('EmberSpire.newRun()');           // calm floor, so input checks are not flaky
  await sleep(250);
  const swipeBefore = await evaluate('EmberSpire.state().turn');
  await evaluate(`(()=>{const c=document.getElementById('view');const r=c.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const dirs=[[0,-60],[60,0],[0,60],[-60,0]];
    for(const d of dirs){
      c.dispatchEvent(new PointerEvent('pointerdown',{clientX:cx,clientY:cy,bubbles:true}));
      c.dispatchEvent(new PointerEvent('pointermove',{clientX:cx+d[0],clientY:cy+d[1],bubbles:true}));
      c.dispatchEvent(new PointerEvent('pointerup',{clientX:cx+d[0],clientY:cy+d[1],bubbles:true}));
    }})()`);
  const swipeAfter = await evaluate('EmberSpire.state().turn');
  check(swipeAfter > swipeBefore, 'a swipe on the board moves the hero (' + (swipeAfter - swipeBefore) + ' turns)');

  const walkBefore = await evaluate('EmberSpire.state().turn');
  await evaluate('EmberSpire.state().mon.length = 0');   // no neighbours nearby: exercise walking, not the cancel rule
  const tgt = await evaluate('(()=>{const S=EmberSpire.state();let best=null,bd=-1;for(const c of EmberSpire.debug.litCells()){if(!window.Dungeon.isFloor(S.tiles[c[1]][c[0]]))continue;const d=Math.abs(c[0]-S.p.x)+Math.abs(c[1]-S.p.y);if(d>bd){bd=d;best=c;}}return best;})()');
  await evaluate('EmberSpire.debug.autoWalk(' + tgt[0] + ',' + tgt[1] + ')');
  await sleep(1500);
  const walkAfter = await evaluate('EmberSpire.state().turn');
  check(walkAfter >= walkBefore + 2, 'tap-to-walk keeps walking unattended (' + (walkAfter - walkBefore) + ' turns)');

  // ...and it stops on its own when something dangerous shows up
  const cancelBefore = await evaluate('EmberSpire.state().turn');
  await evaluate(`(()=>{const S=EmberSpire.state();S.mon.length=0;
    let spot=null;for(const c of EmberSpire.debug.litCells()){const d=Math.abs(c[0]-S.p.x)+Math.abs(c[1]-S.p.y);if(d>=1&&d<=3&&window.Dungeon.isFloor(S.tiles[c[1]][c[0]])&&!(c[0]===S.p.x&&c[1]===S.p.y)){spot=c;break;}}
    if(spot)S.mon.push(window.Rules.spawn('slime',1,spot[0],spot[1]));
    let best=null,bd=-1;for(const c of EmberSpire.debug.litCells()){if(!window.Dungeon.isFloor(S.tiles[c[1]][c[0]]))continue;const d=Math.abs(c[0]-S.p.x)+Math.abs(c[1]-S.p.y);if(d>bd){bd=d;best=c;}}
    EmberSpire.debug.autoWalk(best[0],best[1]);})()`);
  await sleep(900);
  const cancelAfter = await evaluate('EmberSpire.state().turn');
  check(cancelAfter <= cancelBefore + 1, 'auto-walk breaks off when a monster is close (+' + (cancelAfter - cancelBefore) + ' turns)');
  await evaluate('EmberSpire.state().mon.length = 0');

  // descend by stepping onto the stairs (fresh floor, so nothing interferes)
  await evaluate('EmberSpire.newRun()');
  await sleep(200);
  await evaluate('(()=>{const S=EmberSpire.state();const s=S.items.find(i=>i.k==="stairs");const D=[[0,-1],[1,0],[0,1],[-1,0]];for(const d of D){const nx=s.x+d[0],ny=s.y+d[1];const row=S.tiles[ny];if(row&&window.Dungeon.isFloor(row[nx])&&!(nx===S.p.x&&ny===S.p.y)){S.p.x=nx;S.p.y=ny;S._target=[s.x,s.y];break;}}})()');
  await evaluate('(()=>{const S=EmberSpire.state();EmberSpire.tryMove(S._target[0]-S.p.x,S._target[1]-S.p.y);})()');
  await sleep(300);
  st = await evaluate('(()=>{const S=EmberSpire.state();return {floor:S.floor,mon:S.mon.length};})()');
  check(st.floor === 2, 'stairs descend to floor 2: ' + JSON.stringify(st));

  // persistence
  await evaluate('EmberSpire.save()');
  const saved = await evaluate('(()=>{const r=localStorage.getItem("ember-spire:save:v1");return r?JSON.parse(r).floor:null;})()');
  check(saved === 2, 'save data written to localStorage (floor ' + saved + ')');
  check(await evaluate('EmberSpire.loadRun()') === true, 'save can be re-loaded');
  st = await evaluate('(()=>{const S=EmberSpire.state();return {floor:S.floor,seen:Object.keys(S).length};})()');
  check(st.floor === 2, 'loaded run resumes on floor ' + st.floor);

  // sound toggle + settings screen
  await evaluate('document.getElementById("btn-pause").click()');
  await sleep(250);
  await shot('04-pause');
  await evaluate('document.getElementById("btn-pause-settings").click()');
  await sleep(250);
  const soundBefore = await evaluate('EmberSpire.meta().sound');
  await evaluate('document.getElementById("btn-sound-2").click()');
  const soundAfter = await evaluate('EmberSpire.meta().sound');
  check(soundBefore !== soundAfter, 'sound On/Off toggles (' + soundBefore + ' -> ' + soundAfter + ')');
  await shot('05-settings');
  await evaluate('document.getElementById("btn-sound-2").click()');
  await evaluate('document.getElementById("btn-settings-close").click()');
  await evaluate('document.getElementById("btn-resume").click()');

  // help + records
  await evaluate('EmberSpire.showScreen("screen-help")');
  await sleep(200);
  await shot('06-help');
  await evaluate('EmberSpire.showScreen(null)');
  await evaluate('EmberSpire.setLang("zh"); EmberSpire.showScreen("screen-records")');
  await sleep(200);
  await shot('07-records-zh');
  await evaluate('EmberSpire.showScreen(null); EmberSpire.setLang("en")');
  await sleep(200);
  await shot('08-play-en');

  // defeat screen
  await evaluate('EmberSpire.debug.hurt(9999)');
  await sleep(400);
  const dead = await evaluate('!document.getElementById("screen-death").classList.contains("hidden")');
  check(dead, 'death screen appears when HP runs out');
  await shot('09-death');
  const metaAfterDeath = await evaluate('(()=>{const m=EmberSpire.meta();return {runs:m.runs,deepest:m.deepest,best:m.best,gold:m.gold};})()');
  check(metaAfterDeath.runs >= 1 && metaAfterDeath.deepest >= 2, 'records updated after death: ' + JSON.stringify(metaAfterDeath));
  check(await evaluate('localStorage.getItem("ember-spire:save:v1")') === null, 'the dead run wipes its save (roguelike)');

  // restart from the death screen
  await evaluate('document.getElementById("btn-retry").click()');
  await sleep(300);
  st = await evaluate('(()=>{const S=EmberSpire.state();return S?{floor:S.floor,hp:S.p.hp,lvl:S.p.lvl}:null;})()');
  check(st && st.floor === 1 && st.lvl === 1 && st.hp > 0, 'retry starts a fresh run: ' + JSON.stringify(st));
  await shot('10-retry');

  // layout sanity: the screen stays portrait on a desktop window
  const box = await evaluate('(()=>{const a=document.getElementById("app").getBoundingClientRect();return {w:Math.round(a.width),h:Math.round(a.height),scroll:document.documentElement.scrollHeight - window.innerHeight};})()');
  check(box.h > box.w, 'portrait layout on a desktop window: ' + box.w + 'x' + box.h);
  check(box.scroll <= 2, 'no vertical overflow (scroll delta ' + box.scroll + ')');
  const cv = await evaluate('(()=>{const c=document.getElementById("view").getBoundingClientRect();return {w:Math.round(c.width),h:Math.round(c.height)};})()');
  check(cv.w <= box.w && cv.h > 0, 'canvas fits the stage: ' + cv.w + 'x' + cv.h);
  const heights = await evaluate('(()=>{const h=(s)=>Math.round(document.querySelector(s).getBoundingClientRect().height);return {topbar:h(".topbar"),hud:h(".hud"),stage:h(".stage"),controls:h(".controls"),canvas:h("#view")};})()');
  console.log('  layout ' + JSON.stringify(heights));
  check(heights.canvas / box.h >= 0.45, 'the board fills at least 45% of the screen (' + Math.round(100 * heights.canvas / box.h) + '%)');

  console.log('\n--- phone viewport (390x844, dpr 2) ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  await evaluate('EmberSpire.resize()');
  await sleep(200);
  const phone = await evaluate('(()=>{const app=document.getElementById("app").getBoundingClientRect();const c=document.getElementById("view").getBoundingClientRect();const visible=[...document.querySelectorAll(".pad-btn,.act,.btn,.chip")].filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().width>0);const sizes=visible.map(e=>{const r=e.getBoundingClientRect();return Math.min(r.width,r.height);});return {appW:Math.round(app.width),appH:Math.round(app.height),canvas:[Math.round(c.width),Math.round(c.height)],scroll:document.documentElement.scrollHeight-window.innerHeight,touchTargets:visible.length,tooSmall:sizes.filter(w=>w<40).length,minTarget:Math.round(Math.min(...sizes))};})()');
  console.log('  phone metrics ' + JSON.stringify(phone));
  check(phone.appW <= 390, 'app fits a 390px-wide phone screen');
  check(phone.scroll <= 2, 'no scrolling needed on a phone (delta ' + phone.scroll + ')');
  check(phone.tooSmall === 0, 'every control is at least 40px tall/wide (smallest ' + phone.minTarget + 'px)');
  check(phone.canvas[0] <= 390 && phone.canvas[1] > 0, 'board fits the phone stage: ' + phone.canvas.join('x'));
  await shot('11-phone-ja');
  await evaluate('EmberSpire.setLang("zh")');
  await sleep(200);
  await shot('12-phone-zh');
  await evaluate('EmberSpire.setLang("en")');
  await sleep(150);
  await shot('13-phone-en');
  await send('Emulation.clearDeviceMetricsOverride');
  await evaluate('EmberSpire.setLang("ja"); EmberSpire.resize()');

  console.log('\n--- page errors ---');
  if (pageErrors.length) pageErrors.slice(0, 12).forEach((e) => console.log('  ' + e));
  else console.log('  none');

  console.log('\nRESULT: ' + (problems.length === 0 && pageErrors.length === 0
    ? 'all browser checks passed'
    : problems.length + ' failed check(s), ' + pageErrors.length + ' page error(s)'));

  try { await send('Browser.close'); } catch (e) { /* closing kills the socket */ }
  proc.kill('SIGKILL');
  process.exit(problems.length === 0 && pageErrors.length === 0 ? 0 : 1);
})().catch((err) => {
  console.log('HARNESS ERROR: ' + err.message);
  try { proc.kill('SIGKILL'); } catch (e) {}
  process.exit(1);
});
