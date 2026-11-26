/* CASPIAN original procedural soundtrack: generated locally with Web Audio API. */
(() => {
 'use strict';
 const $music=id=>document.getElementById(id);
 const toggle=$music('musicToggle'),volume=$music('musicVolume'),status=$music('musicStatus');
 if(!toggle||!volume||!status)return;
 let context=null,master=null,voices=[],timer=null,enabled=false,mode='intro',step=0;
 const tracks={
  intro:{bpm:86,root:146.83,scale:[0,3,7,10,12,10,7,3],wave:'triangle',pulse:.075},
  day:{bpm:104,root:196,scale:[0,4,7,11,12,7,4,2],wave:'sine',pulse:.055},
  night:{bpm:72,root:110,scale:[0,3,5,10,7,5,3,2],wave:'sine',pulse:.045}
 };
 function clearVoices(){if(timer){clearInterval(timer);timer=null;}voices.forEach(node=>{try{node.stop?.();}catch{}try{node.disconnect();}catch{}});voices=[];}
 function tone(freq,duration,gain,wave='sine',when=0){
  if(!context||!master)return;
  const osc=context.createOscillator(),amp=context.createGain(),filter=context.createBiquadFilter();
  osc.type=wave;osc.frequency.setValueAtTime(freq,context.currentTime+when);
  filter.type='lowpass';filter.frequency.value=wave==='sawtooth'?900:1800;
  amp.gain.setValueAtTime(.0001,context.currentTime+when);
  amp.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),context.currentTime+when+.08);
  amp.gain.exponentialRampToValueAtTime(.0001,context.currentTime+when+duration);
  osc.connect(filter);filter.connect(amp);amp.connect(master);
  osc.onended=()=>{[osc,amp,filter].forEach(node=>{try{node.disconnect();}catch{}const index=voices.indexOf(node);if(index>=0)voices.splice(index,1);});};
  osc.start(context.currentTime+when);osc.stop(context.currentTime+when+duration+.04);
  voices.push(osc,amp,filter);
 }
 function note(freq,duration,gain,wave){tone(freq,duration,gain,wave);}
 function playStep(){
  const track=tracks[mode];if(!track||!context||!master)return;
  const semitones=track.scale[step%track.scale.length],frequency=track.root*Math.pow(2,semitones/12);
  note(frequency,1.15,track.pulse,track.wave);
  if(step%4===0){note(track.root/2,2.8,.035,'sine');note(track.root*Math.pow(2,(semitones+7)/12),.72,.022,'triangle');}
  if(mode==='night'&&step%2===1)note(track.root*2*Math.pow(2,semitones/12),.55,.012,'sine');
  step++;
 }
 function setStatus(text){status.textContent=text;}
 function isMafia(role){
  const r=String(role||'').replace(/\s/g,'');
  return /مافیا|امپراتور|پدرخوانده|گانگستر|جاعل|بازجو|استراتژیست|shadowmafia/i.test(r);
 }
 function desiredMode(){
  if(!enabled)return 'off';
  if(typeof phase==='undefined'||phase==='لابی'||phase==='روز'||phase==='day')return phase==='لابی'?'intro':'day';
  if(phase==='شب'||phase==='night'){
   if(!currentRole)return 'off';
   return isMafia(currentRole)?'off':'night';
  }
  return 'intro';
 }
 function applyMode(){
  const next=desiredMode();
  if(next===mode&&((next==='off')||timer))return;
  clearVoices();mode=next;step=0;
  if(next==='off'){if(enabled&&((phase==='شب'||phase==='night')&&currentRole&&isMafia(currentRole)))setStatus('موسیقی شب برای نقش مافیا خاموش است');else setStatus(enabled?'منتظر دریافت نقش محرمانه…':'موسیقی خاموش است');return;}
  if(!context){setStatus('برای پخش، دکمه فعال‌سازی را لمس کن');return;}
  master.gain.setTargetAtTime(Number(volume.value)/100,context.currentTime,.12);
  const label={intro:'موسیقی آغاز کاسپین',day:'موسیقی روز و رأی‌گیری',night:'موسیقی شب شهروندان'}[next];
  setStatus(label+' · در حال پخش');
  playStep();timer=setInterval(playStep,Math.round(60000/tracks[next].bpm));
 }
 async function activate(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx){setStatus('مرورگر شما پخش موسیقی را پشتیبانی نمی‌کند');return;}
  if(!context){context=new AudioCtx();master=context.createGain();master.gain.value=Number(volume.value)/100;master.connect(context.destination);}
  await context.resume();enabled=true;localStorage.setItem('caspianMusicEnabled','true');
  toggle.textContent='⏸ خاموش‌کردن موسیقی';applyMode();
 }
 toggle.addEventListener('click',async()=>{
  if(enabled){enabled=false;localStorage.setItem('caspianMusicEnabled','false');clearVoices();mode='off';if(master)master.gain.setTargetAtTime(0,context.currentTime,.08);toggle.textContent='♫ فعال‌سازی موسیقی';setStatus('موسیقی خاموش است');}
  else{try{await activate();}catch{setStatus('فعال‌سازی صدا ممکن نشد؛ دوباره لمس کن');}}
 });
 volume.addEventListener('input',()=>{if(master&&context)master.gain.setTargetAtTime(Number(volume.value)/100,context.currentTime,.08);});

 if(typeof socket!=='undefined'){
  socket.on('room',r=>{phase=r.phase||'لابی';applyMode();});
  socket.on('myRole',role=>{currentRole=role;applyMode();});
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearVoices();}else if(enabled&&context?.state==='running'){mode='off';applyMode();}});
})();
