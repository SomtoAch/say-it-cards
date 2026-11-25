'use strict';
{
const $=id=>document.getElementById(id);
const PRESETS={
capitals:`France | Paris
Japan | Tokyo
Australia | Canberra
Canada | Ottawa
Egypt | Cairo
Brazil | Brasília
Kenya | Nairobi
Norway | Oslo`,
spanish:`dog | perro
cat | gato
house | casa
car | coche / carro
thank you | gracias
good morning | buenos días
water | agua
book | libro`,
science:`Powerhouse of the cell | mitochondria
H2O is the formula for | water
Unit of electrical resistance | ohm
Closest planet to the Sun | Mercury
Gas plants absorb | carbon dioxide
Speed of light symbol | c`};
// Decks and settings are kept only in this browser's localStorage; nothing is sent to a server.
const store={get(k,d){try{const v=localStorage.getItem('sayit:'+k);return v===null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem('sayit:'+k,JSON.stringify(v))}catch{}}};

const deckEl=$('deck'),langEl=$('lang'),shuffleEl=$('shuffle'),readEl=$('readAloud'),requeueEl=$('requeue');
const MATCH=0.75; // how similar a spoken answer must be to count (fixed for everyone)
const MAX_UPLOAD=2*1024*1024; // 2 MB: plenty for thousands of cards, small enough not to freeze the tab
deckEl.value=store.get('deck',PRESETS.capitals);
langEl.value=store.get('lang','en-GB');
shuffleEl.checked=store.get('shuffle',false);
readEl.checked=store.get('read',false);
requeueEl.checked=store.get('requeue',true);
// radios normally can't be unticked; let a click on a selected one switch it off
[shuffleEl,readEl,requeueEl].forEach(r=>{
  r.dataset.on=r.checked?'1':'';
  r.addEventListener('click',()=>{
    if(r.dataset.on){r.checked=false;r.dataset.on='';r.dispatchEvent(new Event('change'))}
    else r.dataset.on='1';
  });
});
$('dir').value=store.get('dir','normal');

// ---------- matching ----------
const NUM={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean).map(w=>Object.hasOwn(NUM,w)?String(NUM[w]):w);
const lev=(a,b)=>{const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]};
const sim=(a,b)=>{if(a===b)return 1;const L=Math.max(a.length,b.length);return L?1-lev(a,b)/L:1};
const CJK=/[぀-ヿ一-鿿가-힯]/;
function score(heard,answer){
  const h=norm(heard),a=norm(answer);if(!a.length||!h.length)return 0;
  if(CJK.test(answer)){const hs=h.join(''),as=a.join('');return hs.includes(as)?1:sim(hs.slice(-as.length),as)}
  const target=a.join(' ');let best=0;
  for(let len=Math.max(1,a.length-1);len<=a.length+1;len++)
    for(let i=0;i+len<=h.length;i++)best=Math.max(best,sim(h.slice(i,i+len).join(' '),target));
  if(h.length<a.length)best=Math.max(best,sim(h.join(' '),target));
  return best;
}
const answers=c=>c.a.split('/').map(s=>s.trim()).filter(Boolean);

// ---------- deck & session ----------
let queue=[],idx=0,ok=0,miss=0,busy=false;
function parse(){
  const cards=deckEl.value.split('\n').map(l=>l.split('|')).filter(p=>p.length>=2&&p[0].trim()&&p[1].trim()).map(p=>({q:p[0].trim(),a:p.slice(1).join('|').trim()}));
  const flip=c=>({q:c.a,a:c.q});
  const d=$('dir').value;
  return d==='flip'?cards.map(flip):d==='both'?[...cards,...cards.map(flip)]:cards;
}
function restart(){
  queue=parse();if(shuffleEl.checked)for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]]}
  idx=0;ok=0;miss=0;busy=false;render();
}
function render(){
  const c=queue[idx],card=$('card');card.classList.remove('ok','miss');$('answer').textContent='';
  $('sOk').textContent=ok;$('sMiss').textContent=miss;$('sLeft').textContent=Math.max(0,queue.length-idx);
  if(!queue.length){$('prompt').textContent='Add some cards below';$('pos').textContent='';return}
  if(!c){$('prompt').textContent=miss?`Done: ${ok} right, ${miss} skipped`:`All ${ok} right!`;$('pos').textContent='Deck finished';$('answer').textContent='Press Restart deck to go again';return}
  $('prompt').textContent=c.q;$('pos').textContent=`Card ${Math.min(idx+1,queue.length)} of ${queue.length}`;
  $('typed').value='';
  if(readEl.checked&&listening)speak(c.q);
}
function advance(delay){busy=true;setTimeout(()=>{idx++;busy=false;ignoreFrom=resultsLen;render()},delay)}
function correct(){if(busy||!queue[idx])return;ok++;$('card').classList.add('ok');$('answer').textContent='✓ '+answers(queue[idx])[0];beep(880);advance(700)}
function skip(){if(busy||!queue[idx])return;const c=queue[idx];miss++;$('card').classList.add('miss');$('answer').textContent=answers(c).join(' / ');if(requeueEl.checked)queue.push(c);beep(300);advance(2200)}
function check(text){
  const c=queue[idx];if(!c||busy)return false;
  const t=norm(text).join(' ');
  if(/\b(skip|pass|i dont know|next)\b$/.test(t)&&!answers(c).some(a=>norm(a).join(' ')==='next')){skip();return true}
  if(/\b(repeat|say again)\b$/.test(t)){speak(c.q);ignoreFrom=resultsLen;return true}
  if(answers(c).some(a=>score(text,a)>=MATCH-1e-9)){correct();return true}
  return false;
}

// ---------- audio ----------
let actx;function beep(f){try{actx=actx||new AudioContext();const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=f;g.gain.setValueAtTime(.12,actx.currentTime);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+.25);o.connect(g).connect(actx.destination);o.start();o.stop(actx.currentTime+.25)}catch{}}
let speaking=false;
// Fixed read-aloud voice for everyone: American female, normal speed.
// Voices depend on the user's device, so try these in order and fall back to any US English voice.
const VOICE_PREFS=['Microsoft Aria Online','Microsoft Jenny Online','Google US English','Samantha','Microsoft Zira'];
const VOICE_RATE=1;
if('speechSynthesis' in window)speechSynthesis.getVoices(); // Chrome loads voices lazily; start it early
const pickVoice=()=>{
  const vs=speechSynthesis.getVoices();
  for(const p of VOICE_PREFS){const v=vs.find(v=>v.name.startsWith(p));if(v)return v}
  return vs.find(v=>v.lang.replace('_','-')==='en-US')||null;
};
function speak(text){
  if(!('speechSynthesis' in window))return;speechSynthesis.cancel();
  // Chrome fills the voice list late; wait briefly for it so the fixed voice is used every time
  if(!speechSynthesis.getVoices().length&&!speak._waited){
    speak._waited=true;let done=false;
    const go=()=>{if(done)return;done=true;speechSynthesis.removeEventListener('voiceschanged',go);speak(text)};
    speechSynthesis.addEventListener('voiceschanged',go);setTimeout(go,1000);return;
  }
  const u=new SpeechSynthesisUtterance(text);
  // Keep the fixed voice for anything in the Latin alphabet (accents, curly quotes, dashes included);
  // only switch for other scripts (Japanese, Chinese, Cyrillic, Arabic...) that an English voice can't read
  const otherScript=/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text);
  const lang=otherScript?langEl.value:'en-US';
  const v=!otherScript&&pickVoice();
  if(v){u.voice=v;u.lang=v.lang}else u.lang=lang;
  u.rate=VOICE_RATE;
  speaking=true;u.onend=u.onerror=()=>{speaking=false;ignoreFrom=resultsLen};speechSynthesis.speak(u);
}

// ---------- recognition ----------
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,listening=false,ignoreFrom=0,resultsLen=0,sticky=false;
// sticky: keep an informational warning visible after listening starts
function warn(msg,keep=false){const w=$('warn');w.textContent=msg;w.hidden=!msg;sticky=!!msg&&keep}
if(!SR)warn('Your browser can’t recognise speech. Open this page in Chrome or Edge on a computer, or Safari on a Mac, iPhone or iPad. You can still type your answers.');
function startRec(){
  rec=new SR();rec.lang=langEl.value;rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=3;
  ignoreFrom=0;resultsLen=0;
  rec.onresult=e=>{
    resultsLen=e.results.length;if(speaking)return;
    const parts=[];for(let i=ignoreFrom;i<e.results.length;i++)parts.push(e.results[i]);
    if(!parts.length)return;
    const main=parts.map(r=>r[0].transcript).join(' ').trim();
    const h=$('heard');h.textContent='Heard: ';const b=document.createElement('b');b.textContent=main;h.append(b);
    // try every alternative of the latest result too
    const last=parts[parts.length-1],before=parts.slice(0,-1).map(r=>r[0].transcript).join(' ');
    for(let k=0;k<last.length;k++)if(check((before+' '+last[k].transcript).trim()))return;
    // stop a long run-on from piling up: after a final result that didn't match, start fresh
    if(last.isFinal&&parts.length>2)ignoreFrom=e.results.length;
  };
  rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed'){warn('Microphone access was blocked. Allow the microphone for this site using the icon in your browser’s address bar, then press Start again.');stop()}else if(e.error==='network')warn('Speech recognition needs an internet connection in this browser.');else if(e.error==='audio-capture'){warn('No microphone could be used. Check it is plugged in and not in use by another app.');stop()}};
  rec.onstart=()=>{if(!sticky)warn('');$('heard').textContent='Listening… say the answer.'};
  rec.onend=()=>{if(listening)try{startRec()}catch{}};
  try{rec.start()}catch{}
}
async function start(){
  if(!SR)return;
  if(window.top!==window){warn('The microphone doesn’t work when this app is shown inside another page. Open it in its own browser tab.');return}
  if(location.protocol==='file:')warn('This app was opened from a file on your computer. If the microphone doesn’t work, open it from its web address instead.',true);
  else warn('');
  if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
    try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop())}
    catch(err){warn(err.name==='NotAllowedError'?'Microphone permission was denied. Click the icon at the left of the address bar, set Microphone to Allow, then reload the page.':err.name==='NotFoundError'?'No microphone was found. Plug one in or check your system sound settings.':'The microphone couldn’t be opened. Check your browser’s microphone settings and try again.');return}
  }else if(!window.isSecureContext){warn('Your browser only allows the microphone on secure (https) pages. Open the app from its https address.');return}
  listening=true;$('card').parentElement.classList.add('live');$('startBtn').textContent='Stop listening';startRec();if(readEl.checked&&queue[idx])speak(queue[idx].q)}
function stop(){listening=false;$('card').parentElement.classList.remove('live');$('startBtn').textContent='Start listening';try{rec&&rec.abort()}catch{}}

// ---------- upload ----------
// Uploaded text is untrusted: tags are stripped here, and every value is only ever shown with
// textContent / .value (never innerHTML), so a crafted file can't run code.
const clean=s=>String(s??'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]*>/g,'').replace(/\[sound:[^\]]*\]/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
function csvRows(text,sep){ // handles quoted fields with commas/newlines
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}
    else if(ch==='"'&&f==='')q=true;
    else if(ch===sep){row.push(f);f=''}
    else if(ch==='\n'){row.push(f);rows.push(row);row=[];f=''}
    else if(ch!=='\r')f+=ch}
  if(f||row.length){row.push(f);rows.push(row)}
  return rows;
}
function parseFile(name,text){
  text=text.replace(/^﻿/,'');
  if(/\.json$/i.test(name)||/^\s*[\[{]/.test(text)){
    let d=JSON.parse(text);
    if(!Array.isArray(d))d=d&&typeof d==='object'?(Array.isArray(d.cards)?d.cards:Array.isArray(d.deck)?d.deck:Object.entries(d).map(([q,a])=>({q,a}))):[];
    return d.filter(c=>c&&typeof c==='object').map(c=>Array.isArray(c)?[c[0],c[1]]:[c.q??c.question??c.front??c.term,c.a??c.answer??c.back??c.definition]);
  }
  const lines=text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  const has=ch=>lines.filter(l=>l.includes(ch)).length>=lines.length*0.6;
  let rows;
  if(has('|'))rows=lines.map(l=>{const i=l.indexOf('|');return[l.slice(0,i),l.slice(i+1)]});
  else if(has('\t'))rows=csvRows(text.split(/\r?\n/).filter(l=>!l.startsWith('#')).join('\n'),'\t');
  else if(has(';')&&!has(','))rows=csvRows(text,';');
  else if(has(','))rows=csvRows(text,',');
  else if(has(' - '))rows=lines.map(l=>{const i=l.indexOf(' - ');return[l.slice(0,i),l.slice(i+3)]});
  else if(has(':'))rows=lines.map(l=>{const i=l.indexOf(':');return[l.slice(0,i),l.slice(i+1)]});
  else throw new Error('Couldn’t tell how questions and answers are separated. Put each card on its own line with a comma, tab or | between the question and the answer.');
  if(rows.length&&/^(front|question|term|word|prompt|q)$/i.test(clean(rows[0][0]))&&/^(back|answer|definition|meaning|translation|a)$/i.test(clean(rows[0][1]||'')))rows.shift();
  return rows;
}
function upStatus(msg,good){const st=$('upStatus');st.className='hint '+(good?'ok':'bad');st.textContent=msg}
function importText(name,text){
  try{
    const cards=parseFile(name,text).map(([q,a])=>[clean(q).replace(/\|/g,'/'),clean(a)]).filter(([q,a])=>q&&a);
    if(!cards.length)throw new Error('No cards found. Each card needs a question and an answer.');
    const lines=cards.map(([q,a])=>q+' | '+a).join('\n');
    deckEl.value=$('mode').value==='append'&&deckEl.value.trim()?deckEl.value.replace(/\s*$/,'\n')+lines:lines;
    store.set('deck',deckEl.value);restart();
    upStatus(`Loaded ${cards.length} card${cards.length>1?'s':''} from ${name}${$('mode').value==='append'?' (added to the deck)':''}.`,true);
  }catch(err){upStatus((err instanceof SyntaxError?'That JSON file couldn’t be read. ':'')+(err instanceof SyntaxError?'':err.message))}
}
function readFile(f){
  if(!f)return;
  if(/\.(apkg|colpkg)$/i.test(f.name))return upStatus('Anki .apkg packages can’t be read here. In Anki, go to File → Export and choose “Notes in Plain Text” instead.');
  if(f.size>MAX_UPLOAD)return upStatus(`That file is too big (${(f.size/1048576).toFixed(1)} MB). Decks can be up to 2 MB.`);
  const r=new FileReader();r.onload=()=>importText(f.name,r.result);r.onerror=()=>upStatus('That file couldn’t be read.');r.readAsText(f);
}
$('file').onchange=e=>{readFile(e.target.files[0]);e.target.value=''};
deckEl.addEventListener('dragover',e=>{e.preventDefault();deckEl.classList.add('drop')});
deckEl.addEventListener('dragleave',()=>deckEl.classList.remove('drop'));
deckEl.addEventListener('drop',e=>{e.preventDefault();deckEl.classList.remove('drop');readFile(e.dataTransfer.files[0])});
$('dlBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([deckEl.value],{type:'text/plain'}));a.download='my-deck.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};

// ---------- events ----------
$('startBtn').onclick=()=>listening?stop():start();
$('skipBtn').onclick=skip;
$('restartBtn').onclick=restart;
$('typed').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!check(e.target.value)){$('card').animate([{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'none'}],{duration:200})}}});
deckEl.addEventListener('input',()=>{store.set('deck',deckEl.value);clearTimeout(deckEl._t);deckEl._t=setTimeout(restart,600)});
$('preset').onchange=e=>{const k=e.target.value;if(!Object.hasOwn(PRESETS,k))return;deckEl.value=PRESETS[k];if(k==='spanish'){langEl.value='es-ES';langEl.onchange()}store.set('deck',deckEl.value);e.target.value='';restart()};
langEl.onchange=()=>{store.set('lang',langEl.value);if(listening){stop();start()}};
$('dir').onchange=()=>{store.set('dir',$('dir').value);restart()};
shuffleEl.onchange=()=>{store.set('shuffle',shuffleEl.checked);restart()};
readEl.onchange=()=>store.set('read',readEl.checked);
requeueEl.onchange=()=>store.set('requeue',requeueEl.checked);
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.code==='Space'){e.preventDefault();listening?stop():start()}if(e.key==='ArrowRight')skip()});
restart();
}
