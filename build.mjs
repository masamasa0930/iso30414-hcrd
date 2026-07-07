// app.html（平文マスター）をパスワードでAES-256-GCM暗号化し、
// 復号ゲート付きの index.html（公開用）を生成する。
// 使い方: node build.mjs "パスワード"
import {readFileSync, writeFileSync} from 'node:fs';
import {webcrypto as crypto} from 'node:crypto';

const pwd = process.argv[2];
if (!pwd) { console.error('使い方: node build.mjs "パスワード"'); process.exit(1); }

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const ITER = 310000;

const keyMat = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  {name:'PBKDF2', salt, iterations:ITER, hash:'SHA-256'},
  keyMat, {name:'AES-GCM', length:256}, true, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(html)));
const b64 = b => Buffer.from(b).toString('base64');

const out = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ISO 30414 人的資本レポート作成システム</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#12433c 0%,#0e7c6b 62%,#3d9e8c 100%);
    font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic Medium","Yu Gothic",Meiryo,sans-serif}
  .gate{background:#fff;border-radius:14px;padding:40px 38px;width:min(400px,92vw);box-shadow:0 18px 50px rgba(0,0,0,.28)}
  .eyebrow{font-size:10.5px;letter-spacing:.22em;color:#0a5c50;font-weight:700;margin-bottom:8px}
  h1{font-size:18px;color:#1c2733;margin-bottom:4px}
  .sub{font-size:12px;color:#5d6b77;margin-bottom:22px}
  label{display:block;font-size:11.5px;font-weight:700;color:#5d6b77;margin-bottom:5px}
  input[type=password]{width:100%;font-size:15px;padding:10px 12px;border:1.5px solid #dde3e6;border-radius:8px}
  input[type=password]:focus{outline:2px solid #0e7c6b;border-color:#0e7c6b}
  .row{display:flex;align-items:center;gap:7px;margin:13px 0 17px;font-size:12px;color:#5d6b77}
  button{width:100%;background:#0e7c6b;color:#fff;border:0;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer}
  button:hover{background:#0a5c50}
  button:disabled{opacity:.55;cursor:wait}
  .err{color:#b4232a;font-size:12px;font-weight:700;margin-top:11px;display:none}
  .foot{font-size:10.5px;color:#98a4ad;margin-top:20px;line-height:1.6}
</style>
</head>
<body>
<div class="gate">
  <div class="eyebrow">ISO 30414:2025 — HCRD</div>
  <h1>人的資本レポート作成システム</h1>
  <div class="sub">関係者専用ページです。パスワードを入力してください。</div>
  <form id="f">
    <label for="pw">パスワード</label>
    <input type="password" id="pw" autocomplete="current-password" autofocus>
    <div class="row"><input type="checkbox" id="rem" checked><label for="rem" style="margin:0;font-weight:600">このブラウザで記憶する</label></div>
    <button id="btn" type="submit">開く</button>
    <div class="err" id="err">パスワードが違います。</div>
  </form>
  <div class="foot">株式会社ロジック・ブレイン ｜ 入力データは利用者のブラウザ内にのみ保存されます。</div>
</div>
<script>
const SALT='${b64(salt)}',IV='${b64(iv)}',CT='${b64(ct)}',ITER=${ITER},KEYNAME='hcrdGateKey';
const dec=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function tryKey(key){
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:dec(IV)},key,dec(CT));
  return new TextDecoder().decode(pt);
}
async function open_(html,key,remember){
  if(remember){try{const raw=await crypto.subtle.exportKey('raw',key);
    localStorage.setItem(KEYNAME,btoa(String.fromCharCode(...new Uint8Array(raw))));}catch(e){}}
  document.open();document.write(html);document.close();
}
async function unlock(pwd,remember){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pwd),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:dec(SALT),iterations:ITER,hash:'SHA-256'},km,{name:'AES-GCM',length:256},true,['decrypt','encrypt']);
  const html=await tryKey(key);
  await open_(html,key,remember);
}
document.getElementById('f').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const btn=document.getElementById('btn'),err=document.getElementById('err');
  btn.disabled=true;err.style.display='none';
  try{await unlock(document.getElementById('pw').value,document.getElementById('rem').checked);}
  catch(e){err.style.display='block';btn.disabled=false;}
});
// 記憶済みキーで自動ログイン
(async()=>{
  const s=localStorage.getItem(KEYNAME);if(!s)return;
  try{const key=await crypto.subtle.importKey('raw',dec(s),{name:'AES-GCM'},true,['decrypt','encrypt']);
    const html=await tryKey(key);await open_(html,key,false);}
  catch(e){localStorage.removeItem(KEYNAME);}
})();
</script>
</body>
</html>`;

writeFileSync(new URL('./index.html', import.meta.url), out);
console.log(`index.html を生成しました（暗号化済み ${Math.round(out.length/1024)}KB / PBKDF2 ${ITER}回 / AES-256-GCM）`);
