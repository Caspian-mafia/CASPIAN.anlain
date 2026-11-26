'use strict';
const socket=io({reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:10000,timeout:20000}),$=id=>document.getElementById(id);
function connectionStatus(label,connected=false){const el=$('connectionStatus');if(el){el.textContent=label;el.dataset.connected=String(connected);}}
window.caspianSocket=socket;
let roomCode=localStorage.getItem('caspianRoom')||sessionStorage.getItem('caspianRoom')||'',hostKey=localStorage.getItem('caspianHost')||sessionStorage.getItem('caspianHost')||'',playerId=localStorage.getItem('caspianPlayerId')||'',playerToken=localStorage.getItem('caspianPlayerToken')||'',isHost=!!hostKey,players=[],phase='لابی',resumePending=false,currentRole=null,serverClockOffset=0;
function fail(m){$('error').textContent=m||'خطا در اتصال';}
function syncServerClock(serverNow){const stamp=Number(serverNow);if(Number.isFinite(stamp)&&stamp>0)serverClockOffset=stamp-Date.now();}
function saveSession(e){roomCode=e.code;playerId=e.playerId;playerToken=e.playerToken;hostKey=e.hostKey||'';isHost=!!e.isHost||!!hostKey;
 localStorage.setItem('caspianRoom',roomCode);if(playerId&&playerToken){localStorage.setItem('caspianPlayerId',playerId);localStorage.setItem('caspianPlayerToken',playerToken);}else{localStorage.removeItem('caspianPlayerId');localStorage.removeItem('caspianPlayerToken');}if(hostKey)localStorage.setItem('caspianHost',hostKey);else localStorage.removeItem('caspianHost');}
function selectedScenarioId(){return document.querySelector('input[name="scenarioChoice"]:checked')?.value||'classic-mafia';}
function showLobby(){ $('entry').classList.add('hidden');$('lobby').classList.remove('hidden');$('roomCode').textContent=roomCode;if(isHost){$('hostControls').classList.remove('hidden');$('adminLink').href='/admin.html?room='+roomCode;}}
function enter(e){if(!e?.ok){fail(e?.error);return;}saveSession(e);showLobby();}
$('create').onclick=()=>socket.emit('create',{name:$('name').value,scenarioId:selectedScenarioId(),hostMode:$('hostMode')?.value||'player',private:$('roomVisibility')?.value==='private',...selectedPlayerCosmetics()},enter);
$('createEmpire').onclick=()=>{const option=document.querySelector('input[name="scenarioChoice"][value="empire-of-shadows"]');if(option)option.checked=true;socket.emit('create',{name:$('name').value,scenarioId:'empire-of-shadows',hostMode:$('hostMode')?.value||'player',private:$('roomVisibility')?.value==='private',...selectedPlayerCosmetics()},enter);};
$('resumeGame').onclick=()=>resume();
$('newGame').onclick=()=>{localStorage.removeItem('caspianRoom');localStorage.removeItem('caspianPlayerId');localStorage.removeItem('caspianPlayerToken');localStorage.removeItem('caspianHost');sessionStorage.removeItem('caspianRoom');sessionStorage.removeItem('caspianHost');roomCode='';playerId='';playerToken='';hostKey='';isHost=false;$('lobby').classList.add('hidden');$('entry').classList.remove('hidden');$('error').textContent='برای بازی تازه، اتاق جدید بسازید یا با کد اتاق دیگری وارد شوید.';};
$('join').onclick=()=>socket.emit('join',{name:$('name').value,code:$('code').value,...selectedPlayerCosmetics()},enter);
$('deal').onclick=()=>socket.emit('assignRoles',{},r=>{if(!r?.ok)alert(r?.error||'شروع ناموفق');else if(r.selecting)alert('کارت‌های مخفی باز شد؛ هر بازیکن یک کارت انتخاب کند.');});
$('saveFlowSettings')?.addEventListener('click',()=>{const keys={intro:'timeIntro',day1:'timeDay1',discussion:'timeDiscussion',vote:'timeVote',defense:'timeDefense',mafiaTalk:'timeMafiaTalk',mafiaAction:'timeMafiaAction',citizenAbilities:'timeCitizenAbilities',speakerTurn:'timeSpeakerTurn'},settings={};for(const [k,id] of Object.entries(keys))settings[k]=Number($(id).value);socket.emit('host:configure-flow',{settings},r=>alert(r?.ok?'زمان‌ها ذخیره شد.':(r?.error||'ذخیره نشد')));});
$('randomSeats')?.addEventListener('click',()=>socket.emit('host:random-seats',{},r=>{if(!r?.ok)alert(r?.error||'چیدمان انجام نشد');}));
$('advanceFlow')?.addEventListener('click',()=>socket.emit('host:advance-flow',{},r=>{if(!r?.ok)alert(r?.error||'مرحله جلو نرفت');}));
$('resolveNight').onclick=()=>socket.emit('resolveNight',{},r=>{if(!r?.ok)alert(r?.error||'خطا');});
$('resolveDay').onclick=()=>socket.emit('resolveDayVote',{},r=>{if(!r?.ok)alert(r?.error||'خطا');});
$('startNight').onclick=()=>socket.emit('startNight',{},r=>{if(!r?.ok)alert('شروع شب ممکن نشد');});
$('toggleRoom').onclick=()=>socket.emit('setRoomOpen',{open:$('toggleRoom').dataset.open==='true'},r=>{if(!r?.ok)alert(r?.error||'تغییر وضعیت اتاق ناموفق بود');});
$('toggleChat').onclick=()=>socket.emit('setChatOpen',{open:$('toggleChat').dataset.open==='true'},r=>{if(!r?.ok)alert(r?.error||'تغییر وضعیت گفت‌وگو ناموفق بود');});
$('sendHostMessage').onclick=()=>{const message=$('hostMessageInput').value.trim();if(!message)return;socket.emit('hostMessage',{message},r=>{if(r?.ok)$('hostMessageInput').value='';else alert(r?.error||'ارسال پیام ناموفق بود');});};
$('hostMessageInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('sendHostMessage').click();});
$('submitAction').onclick=()=>socket.emit('nightAction',{targetId:$('target').value},r=>{ $('privateResult').textContent=r?.ok?'اقدام شب ثبت شد':(r?.error||'خطا');});
$('submitVote').onclick=()=>socket.emit('dayVote',{targetId:$('target').value,voteEffect:$('voteEffect')?.value||'crown'},r=>{ $('privateResult').textContent=r?.ok?'رأی شما ثبت شد':(r?.error||'خطا');});
$('send').onclick=()=>{const message=$('message').value.trim();if(message){socket.emit('chat',{message});$('message').value='';}};
const CASPIAN_EMOTES=['emote-laugh','emote-fire','emote-skull','emote-heart','emote-moon','emote-crown','emote-star','emote-detective'];
const emoteBar=$('emoteBar');
if(emoteBar){for(const emote of CASPIAN_EMOTES){const button=document.createElement('button');button.type='button';button.className='emote-button';button.title=emote.replace('emote-','');button.setAttribute('aria-label','افزودن ایموجی '+button.title);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/assets/cosmetics/emojis.svg#'+emote);svg.append(use);button.append(svg);button.onclick=()=>{$('message').value=($('message').value+' :'+emote+': ').trim()+' ';$('message').focus();};emoteBar.append(button);}}

$('message').addEventListener('keydown',e=>{if(e.key==='Enter')$('send').click();});
function resume(){if(!roomCode||!playerId||!playerToken||resumePending)return;resumePending=true;
 socket.emit('resumePlayer',{code:roomCode,playerId,playerToken,...selectedPlayerCosmetics()},r=>{resumePending=false;if(!r?.ok){if(r?.finished){$('lobby').classList.add('hidden');$('entry').classList.remove('hidden');$('newGame').classList.remove('hidden');fail('بازی قبلی تمام شده است. برای دریافت نقش جدید، وارد اتاق تازه شوید.');}else{ $('lobby').classList.add('hidden');$('entry').classList.remove('hidden');$('newGame').classList.remove('hidden');fail('بازگشت به اتاق قبلی ممکن نیست. می‌توانید بازی تازه‌ای شروع کنید یا به اتاق دیگری بپیوندید.');}return;}
 isHost=!!r.isHost;showLobby();if(r.role)$('myRole').textContent='نقش شما: '+r.role;});}
socket.on('connect',()=>{connectionStatus('متصل به سرور مرکزی کاسپین',true);if(roomCode&&playerId&&playerToken)resume();else if(roomCode&&hostKey){socket.emit('authenticateHost',{code:roomCode,hostKey},r=>{if(r?.ok){isHost=true;showLobby();}});}});
socket.on('sessionReplaced',()=>{fail('این حساب از دستگاه دیگری به اتاق متصل شد.');});
socket.on('room',r=>{if(r.code!==roomCode)return;syncServerClock(r.serverNow);players=r.players;phase=r.phase;$('phase').textContent=phase+' · دور '+r.round;if(r.phaseDeadline&&$('phaseTimer'))$('phaseTimer').dataset.deadline=String(r.phaseDeadline);if(isHost&&r.flowSettings){const ids={intro:'timeIntro',day1:'timeDay1',discussion:'timeDiscussion',vote:'timeVote',defense:'timeDefense',mafiaTalk:'timeMafiaTalk',mafiaAction:'timeMafiaAction',citizenAbilities:'timeCitizenAbilities',speakerTurn:'timeSpeakerTurn'};for(const [k,id] of Object.entries(ids))if($(id)&&r.flowSettings[k])$(id).value=r.flowSettings[k];}if($('socialTarget')){$('socialTarget').replaceChildren(new Option('انتخاب مخاطب',''));for(const p of players)if(p.id!==playerId)$('socialTarget').add(new Option(p.name,p.id));}if($('roomScenario'))$('roomScenario').textContent=r.scenarioName||'کاسپین کلاسیک';$('count').textContent='('+players.length+'/'+(r.maxPlayers||16)+')';$('players').replaceChildren();$('target').replaceChildren(new Option('انتخاب بازیکن هدف',''));for(const p of [...players].sort((a,b)=>(a.seat||999)-(b.seat||999))){const li=document.createElement('li');li.className='room-player';const portrait=document.createElement('span');portrait.className='room-player-portrait';renderPlayerPortrait(portrait,p.avatarId,p.frameId);const info=document.createElement('span');info.className='room-player-info';const playerName=document.createElement('strong');playerName.textContent=p.name;const status=document.createElement('small');status.textContent=(p.host?'گرداننده · ':'')+(p.alive?'زنده':'حذف‌شده');info.append(playerName,status);li.append(portrait,info);
 if(isHost&&!r.started){const seat=document.createElement('select');seat.className='seat-control';seat.title='شماره صندلی';for(let n=1;n<=(r.maxPlayers||16);n++)seat.add(new Option('صندلی '+n,n));seat.value=String(p.seat||1);seat.onchange=()=>socket.emit('host:seat',{playerId:p.id,seat:Number(seat.value)},res=>{if(!res?.ok)alert(res?.error||'تغییر صندلی ناموفق بود');});li.append(seat);}else if(isHost&&['intro','day1','discussion','vote','defense'].includes(r.gameStage)&&p.alive){const speak=document.createElement('button');speak.type='button';speak.textContent='نوبت صحبت';speak.onclick=()=>socket.emit('host:speaker-turn',{playerId:p.id},res=>{if(!res?.ok)alert(res?.error||'نوبت صحبت تنظیم نشد');});li.append(speak);}else if(isHost&&r.gameStage==='citizenAbilities'&&p.alive&&p.id!==r.turnPlayerId){const privateCall=document.createElement('button');privateCall.type='button';privateCall.textContent='گفت‌وگوی خصوصی';privateCall.onclick=()=>socket.emit('host:private-turn',{playerId:p.id},res=>{if(!res?.ok)alert(res?.error||'تماس خصوصی ممکن نشد');});li.append(privateCall);}
 $('players').append(li);if(p.alive)$('target').add(new Option(p.name,p.id));}
 $('actionPanel').classList.toggle('hidden',!r.started||r.gameStage==='cardSelection');$('actionTitle').textContent=r.gameStage==='mafiaAction'?'اقدام مخفی مافیا':r.gameStage==='citizenAbilities'?'توانایی محرمانه نقش شما':'اقدام مرحله';$('submitAction').classList.toggle('hidden',!['mafiaAction','citizenAbilities'].includes(r.gameStage)||!ROLE_ACTION_ACCESS.has(currentRole));$('submitVote').classList.toggle('hidden',r.gameStage!=='vote');$('chatArea').classList.toggle('hidden',!r.chatOpen);$('roomStatus').textContent=(r.roomOpen?'ورود باز':'ورود بسته')+' · '+(r.chatOpen?'گفت‌وگو فعال':'گفت‌وگو بسته');$('toggleRoom').textContent=r.roomOpen?'بستن ورود به اتاق':'باز کردن ورود به اتاق';$('toggleRoom').dataset.open=String(!r.roomOpen);$('toggleRoom').disabled=r.started||r.finished;$('toggleChat').textContent=r.chatOpen?'بستن گفت‌وگو':'باز کردن گفت‌وگو';$('toggleChat').dataset.open=String(!r.chatOpen);$('toggleChat').disabled=r.finished;$('hostControls').classList.toggle('hidden',!isHost);});
const ROLE_ACTION_ACCESS=new Set(['پزشک','دکتر لکتر','کارآگاه','بازپرس','تکاور','زودیاک','قاتل زنجیره‌ای','مستقل','مافیا','پدرخوانده','گانگستر','مافیای سایه','استراتژیست','مافیای ساده','رئیس شبکه','مجری شبکه','خبرنگار','شاهد','رهبر زودیاک','پیرو زودیاک','طالع‌بین','ردیاب','محافظ','رئیس باند شرق','عضو باند شرق','رئیس باند غرب','عضو باند غرب','سرکرده نفوذی‌ها','نفوذی','فرمانده عملیات','تک‌تیرانداز','مهندس خنثی‌سازی','تحلیلگر اطلاعات','ارباب خون‌آشام','خون‌آشام','شکارچی','شفادهنده','نگهبان','بیمار صفر','آلوده پنهان','فرمانده پناهگاه','مهندس','دیده‌بان','غارتگر مستقل','سالار راهزنان','راهزن','کلانتر','معاون کلانتر','جایزه‌بگیر','دوئل‌طلب','کاپیتان شورشی','دزد دریایی','ناخدا','نقشه‌خوان','پزشک کشتی','تفنگدار دریایی','شکارچی گنج','مغز متفکر','هکر','مدیر امنیت','تحلیلگر داده','ردیاب دیجیتال','متخصص دیوار آتش','اپراتور شبکه','نفوذگر مستقل']);
socket.on('role-cards:available',cards=>{
 const panel=$('roleCardPicker'),list=$('roleCardList');if(!panel||!list)return;panel.classList.remove('hidden');list.replaceChildren();
 cards.forEach((card,index)=>{const b=document.createElement('button');b.type='button';b.className='role-card';b.textContent='👑 کارت '+(index+1);b.disabled=!!card.claimed;b.onclick=()=>socket.emit('role-cards:pick',{cardId:card.id},result=>{if(!result?.ok)alert(result?.error||'انتخاب کارت ناموفق بود');else{b.disabled=true;panel.querySelector('p').textContent='کارت انتخاب شد؛ منتظر انتخاب دیگر بازیکنان بمانید.';}});list.append(b);});
});
socket.on('role-cards:updated',cards=>{const list=$('roleCardList');if(!list)return;[...list.children].forEach((b,i)=>{if(cards[i]?.claimed)b.disabled=true;});});
socket.on('role:description',info=>{$('roleDescription').replaceChildren();const title=document.createElement('strong');title.textContent='سناریو: '+(info.scenarioName||'کاسپین')+' · جناح: '+(info.faction||'نامشخص');const ability=document.createElement('p');ability.textContent='توانایی: '+(info.description||'بدون توانایی ویژه');const objective=document.createElement('p');objective.textContent='هدف نقش: '+(info.objective||'طبق قوانین سناریو');const rules=document.createElement('p');rules.textContent='قوانین مهم: '+(info.gameRules||'نقش خود را محرمانه نگه دار.');$('roleDescription').append(title,ability,objective,rules);$('roleCardPicker').classList.add('hidden');});
socket.on('host:role-deck',cards=>{if(!isHost)return;const box=$('hostRoleList');if(!box)return;box.replaceChildren();const title=document.createElement('strong');title.textContent='ترکیب محرمانه کارت‌های نقش (فقط گرداننده)';box.append(title);cards.forEach(c=>{const row=document.createElement('div');row.className='host-role-row';row.textContent='کارت '+c.card+' · '+c.role;box.append(row);});});
socket.on('host:roles',list=>{if(!isHost)return;const box=$('hostRoleList');if(!box)return;box.replaceChildren();const title=document.createElement('strong');title.textContent='فهرست محرمانه نقش‌ها (فقط گرداننده)';box.append(title);list.forEach(p=>{const row=document.createElement('div');row.className='host-role-row';const left=document.createElement('span');left.textContent='صندلی '+(p.seat||'—')+' · '+p.name;const right=document.createElement('strong');right.textContent=p.role||'در انتظار انتخاب';row.append(left,right);box.append(row);});});
socket.on('flow:phase',data=>{syncServerClock(data.serverNow);const el=$('phaseTimer');if(el)el.dataset.deadline=String(data.deadline||0);if(data.label)$('phase').textContent=data.label;});
socket.on('flow:speaker-turn',data=>{syncServerClock(data.serverNow);const p=players.find(x=>x.id===data.playerId);const el=$('phaseTimer');if(el){el.dataset.deadline=String(data.deadline||0);el.textContent='نوبت صحبت: '+(data.name||p?.name||'بازیکن');}});
socket.on('flow:private-turn',data=>{const p=players.find(x=>x.id===data.playerId);$('privateResult').textContent='نوبت محرمانه توانایی: '+(p?.name||'بازیکن')+'؛ فقط گرداننده و بازیکن منتخب صدای یکدیگر را می‌شنوند.';});
setInterval(()=>{const el=$('phaseTimer');if(!el?.dataset.deadline)return;const left=Math.max(0,Math.ceil((Number(el.dataset.deadline)-(Date.now()+serverClockOffset))/1000));el.textContent='زمان باقی‌مانده: '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0');},500);
socket.on('myRole',r=>{currentRole=r;const host=$('myRole');host.replaceChildren();host.classList.add('my-role-card');const art=document.createElement('span');art.className='my-role-art';renderRoleArt(art,r);const label=document.createElement('strong');label.textContent='نقش شما: '+r;host.append(art,label);const actionLabels={'پزشک':'ثبت حفاظت','دکتر لکتر':'حفاظت مافیا','کارآگاه':'استعلام کارآگاهی','بازپرس':'بازجویی محرمانه','تکاور':'شلیک تکاور (یک‌بار در بازی)','زودیاک':'استعلام زودیاک','قاتل زنجیره‌ای':'حذف مستقل','مستقل':'استعلام مستقل','مافیا':'ثبت رأی قتل مافیا','پدرخوانده':'فرمان نهایی مافیا','گانگستر':'رأی قتل گانگستر','مافیای سایه':'رأی قتل سایه','استراتژیست':'رأی تیم مافیا'};$('submitAction').textContent=actionLabels[r]||'اقدام شب';$('submitAction').classList.toggle('hidden',!ROLE_ACTION_ACCESS.has(r)||phase!=='شب');$('actionTitle').textContent=actionLabels[r]||'اقدام مرحله';});
socket.on('privateResult',r=>{$('privateResult').textContent='نتیجه محرمانه استعلام: '+r.result;});
function appendEmoteText(host,message){
 const pattern=/:(emote-(?:laugh|fire|skull|heart|moon|crown|star|detective)):/g;let last=0,match;
 while((match=pattern.exec(message))){host.append(document.createTextNode(message.slice(last,match.index)));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('class','chat-emote');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/assets/cosmetics/emojis.svg#'+match[1]);svg.append(use);host.append(svg);last=pattern.lastIndex;}
 host.append(document.createTextNode(message.slice(last)));
}
socket.on('chat',m=>{const p=document.createElement('p');const name=document.createElement('strong');name.textContent=m.name+': ';p.append(name);appendEmoteText(p,String(m.message||''));$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;});
function socialTarget(){return $('socialTarget')?.value||'';}
document.querySelectorAll('[data-reaction]').forEach(button=>button.addEventListener('click',()=>{const targetId=socialTarget();if(!targetId){fail('اول مخاطب را انتخاب کن.');return;}socket.emit('socialReaction',{targetId,type:button.dataset.reaction},r=>{if(!r?.ok)fail(r?.error);});}));
document.querySelectorAll('[data-sticker]').forEach(button=>button.addEventListener('click',()=>{const targetId=socialTarget();if(!targetId){fail('اول مخاطب را انتخاب کن.');return;}socket.emit('playerSticker',{targetId,stickerId:button.dataset.sticker},r=>{if(!r?.ok)fail(r?.error);});}));
document.querySelectorAll('[data-speaker]').forEach(button=>button.addEventListener('click',()=>{const targetId=socialTarget();if(!targetId){fail('اول مخاطب را انتخاب کن.');return;}socket.emit('speaker',{targetId,speakerId:button.dataset.speaker},r=>{if(!r?.ok)fail(r?.error);});}));
socket.on('socialReaction',r=>{const p=document.createElement('p');p.className='social-feedback';p.textContent=(r.type==='like'?'💜 ':'👎 ')+r.targetName+' · پسند '+r.totals.like+' / نپسند '+r.totals.dislike;$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;});
const stickerArt={suspect:'🕵️‍♀️',watching:'👀',ignore:'🌙',defend:'🛡️','mafia-alert':'🚨',clap:'👏',crown:'👑',laugh:'😂',fire:'🔥'};
socket.on('playerSticker',r=>{const p=document.createElement('p');p.className='sticker-pop';p.textContent=(stickerArt[r.stickerId]||'✨')+' '+r.from+' برای '+r.targetName;$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;});
socket.on('speaker',r=>{const p=document.createElement('p');p.className='speaker-pop speaker-'+r.speakerId;p.textContent='🔊 '+r.from+' → '+r.targetName+' : '+r.text;$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;});
socket.on('voteCast',r=>{const p=document.createElement('p');p.className='vote-pop vote-'+r.effect;p.textContent='⚡ '+r.voterName+' رأی خود را با افکت '+r.effect+' برای '+r.targetName+' ثبت کرد';$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;});
socket.on('notice',m=>{const p=document.createElement('p');p.textContent=m;$('messages').append(p);});
socket.on('nightResult',r=>{$('privateResult').textContent='نتیجه شب: '+(r.deaths.join('، ')||'کسی حذف نشد')+' · نجات‌یافته‌ها: '+r.blocked;});
socket.on('dayResult',r=>{$('privateResult').textContent=r.eliminated?'بازیکن حذف‌شده: '+r.eliminated:(r.tied?'رأی مساوی شد':'هیچ بازیکنی حذف نشد');});
socket.on('voteProgress',r=>{$('privateResult').textContent='رأی ثبت‌شده: '+r.count+' از '+r.total;});
socket.on('gameOver',r=>{const reward=r.reward;const paid=reward?.distributedCoins?`\nجایزه واریزشده به حساب برندگان عضو: ${Number(reward.distributedCoins).toLocaleString('fa-IR')} سکه`:'\nبرای دریافت جایزه، برندگان باید با حساب کاربری وارد بازی شده باشند.';alert('پایان بازی: '+r.reason+paid);refreshAccount();$('lobby').classList.add('hidden');$('entry').classList.remove('hidden');$('newGame').classList.remove('hidden');});
socket.on('disconnect',()=>connectionStatus(navigator.onLine?'ارتباط با سرور قطع شد؛ تلاش برای اتصال مجدد…':'اینترنت گوشی قطع است؛ پس از اتصال دوباره تلاش می‌کنیم.',false));
socket.on('connect_error',()=>{connectionStatus('سرور در دسترس نیست؛ اتصال مجدد در حال انجام است.',false);fail('اتصال به سرور مرکزی برقرار نشد. اینترنت گوشی را بررسی کنید.');});
window.addEventListener('offline',()=>connectionStatus('اینترنت گوشی قطع است؛ بازی و خرید آنلاین در دسترس نیست.',false));
window.addEventListener('online',()=>{connectionStatus('اینترنت وصل شد؛ در حال اتصال به سرور…',false);socket.connect();});
if(roomCode){$('code').value=roomCode;if(playerId&&playerToken){showLobby();$('newGame').classList.remove('hidden');}else if(hostKey){$('name').value='گرداننده';$('entry').classList.add('hidden');$('lobby').classList.remove('hidden');$('roomCode').textContent=roomCode;}}


// Coin store, account session and ZarinPal checkout
let caspianAuthToken=localStorage.getItem('caspianAuthToken')||'';
let caspianGuestToken=localStorage.getItem('caspianGuestToken')||'';
const coinFormat=v=>new Intl.NumberFormat('fa-IR').format(v);
async function apiRequest(path,options={}){const headers={'content-type':'application/json',...(options.headers||{})};if(caspianAuthToken)headers.authorization='Bearer '+caspianAuthToken;const response=await fetch('/api'+path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'درخواست ناموفق بود');return data;}
function accountMessage(m,bad=false){$('accountMessage').textContent=m;$('accountMessage').classList.toggle('error',bad);}
function setAccount(user){const yes=!!user;$('accountState').textContent=yes?'وارد شده‌اید: '+(user.display_name||user.username):'شماره شما شناسه دائمی حساب است';$('phoneNumber').disabled=yes;$('phoneOtp').classList.toggle('hidden',yes);$('requestOtp').classList.toggle('hidden',yes);$('verifyOtp').classList.toggle('hidden',yes);$('accountLogout').classList.toggle('hidden',!yes);if(user?.balance!==undefined)$('coinBalance').textContent=coinFormat(user.balance);}
async function refreshAccount(){if(!caspianAuthToken){setAccount(null);return;}try{const r=await apiRequest('/me');setAccount(r.user);}catch{caspianAuthToken='';localStorage.removeItem('caspianAuthToken');setAccount(null);}}
async function loadCoinPackages(){const host=$('coinPackages');try{const data=await apiRequest('/payments/packages');host.replaceChildren();data.packages.forEach((pkg,i)=>{const card=document.createElement('article');card.className='coin-card';const icon=document.createElement('div');icon.className='coin-icon coin-icon-'+(i%5);icon.setAttribute('aria-hidden','true');const stack=document.createElement('span');stack.className='coin-stack';icon.append(stack);const mark=document.createElement('strong');mark.textContent='C';icon.append(mark);const amount=document.createElement('strong');amount.className='coin-amount';amount.textContent=coinFormat(pkg.coins)+' سکه';const price=document.createElement('p');price.className='coin-price';price.textContent=pkg.amountRial?coinFormat(Math.round(pkg.amountRial/10))+' تومان':'قیمت به‌زودی اعلام می‌شود';const buy=document.createElement('button');buy.type='button';buy.className='coin-buy';buy.textContent=pkg.amountRial?(caspianAuthToken?'خرید بسته':'ورود برای خرید'):'به‌زودی';buy.disabled=!pkg.amountRial;buy.onclick=async()=>{if(!caspianAuthToken){$('phoneNumber').focus();accountMessage('برای خرید ابتدا وارد حساب شوید.');return;}buy.disabled=true;buy.textContent='در حال اتصال…';try{const order=await apiRequest('/payments/zarinpal/create',{method:'POST',body:JSON.stringify({packageId:pkg.id})});location.assign(order.paymentUrl);}catch(e){$('storeMessage').textContent=e.message;buy.disabled=false;buy.textContent='خرید بسته';}};card.append(icon,amount,price,buy);host.append(card);});}catch(e){host.textContent='بارگذاری فروشگاه ناموفق بود: '+e.message;}}
$('requestOtp').onclick=async()=>{try{const phone=$('phoneNumber').value.trim();const r=await fetch('/api/auth/phone/request-otp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone})});const d=await r.json();if(!r.ok)throw new Error(d.error||'ارسال کد ناموفق بود');accountMessage(d.message||'کد ارسال شد.');$('phoneOtp').focus();}catch(e){accountMessage(e.message,true);}};
$('verifyOtp').onclick=async()=>{try{const phone=$('phoneNumber').value.trim(),code=$('phoneOtp').value.trim();const r=await apiRequest('/auth/phone/verify',{method:'POST',body:JSON.stringify({phone,code,guestToken:caspianGuestToken,displayName:$('accountDisplayName').value.trim()})});caspianAuthToken=r.token;localStorage.setItem('caspianAuthToken',caspianAuthToken);localStorage.removeItem('caspianGuestToken');caspianGuestToken='';accountMessage(r.created?'حساب شما با شماره موبایل ساخته شد.':'خوش آمدید؛ اطلاعات قبلی شما بازیابی شد.');await refreshAccount();await loadCoinPackages();await loadCosmetics();await loadSocialStore();}catch(e){accountMessage(e.message,true);}};
$('accountLogout').onclick=async()=>{try{await apiRequest('/auth/logout',{method:'POST'});}catch{}caspianAuthToken='';localStorage.removeItem('caspianAuthToken');$('coinBalance').textContent='—';setAccount(null);accountMessage('از حساب خارج شدید.');await loadCoinPackages();await loadCosmetics();await loadSocialStore();};

async function ensureGuestProfile(){if(caspianAuthToken)return;try{const result=await fetch('/api/guest/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({guestToken:caspianGuestToken})});const data=await result.json();if(result.ok&&data.guestToken){caspianGuestToken=data.guestToken;localStorage.setItem('caspianGuestToken',caspianGuestToken);}}catch{}}
async function guestRequest(path,options={}){const headers={'content-type':'application/json','authorization':'Bearer '+caspianGuestToken,...(options.headers||{})};const response=await fetch('/api'+path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'درخواست ناموفق بود');return data;}
function cosmeticMessage(message,bad=false){$('cosmeticMessage').textContent=message;$('cosmeticMessage').classList.toggle('error',bad);}
function selectedPlayerCosmetics(){return {authToken:caspianAuthToken,guestToken:caspianGuestToken};}
function appendSprite(host,file,id){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/assets/cosmetics/'+file+'#'+id);svg.append(use);host.append(svg);}
function renderPlayerPortrait(host,avatarId,frameId){host.replaceChildren();host.className='room-player-portrait';const avatar=document.createElement('span');avatar.className='room-player-avatar';const avatarFile=String(avatarId||'').startsWith('avatar-zodiac-')?'zodiac.svg':'avatars.svg';appendSprite(avatar,avatarFile,avatarId||'avatar-starter-fox');const frame=document.createElement('span');frame.className='room-player-frame';appendSprite(frame,'frames.svg',frameId||'frame-starter');host.append(avatar,frame);}
const ROLE_ART={'بازپرس':'role-detective','تکاور':'role-hitman','زودیاک':'role-independent','گانگستر':'role-mafia','پدرخوانده':'role-godfather','دکتر لکتر':'role-doctor-lecter','مافیا':'role-mafia','کارآگاه':'role-detective','پزشک':'role-doctor','شهروند':'role-citizen','قاتل زنجیره‌ای':'role-serial-killer','مستقل':'role-independent','جاسوس مستقل':'role-independent'};
function renderRoleArt(host,role){host.replaceChildren();appendSprite(host,'roles.svg',ROLE_ART[role]||'role-citizen');}
function drawProfile(equipped,owned){
 const avatarId=equipped?.avatar_cosmetic_id,frameId=equipped?.frame_cosmetic_id;if(avatarId)localStorage.setItem('caspianEquippedAvatar',avatarId);if(frameId)localStorage.setItem('caspianEquippedFrame',frameId);
 const avatar=(owned||[]).find(x=>x.id===avatarId),frame=(owned||[]).find(x=>x.id===frameId);
 renderCosmeticArt($('profileAvatar'),avatar,'avatar');
 renderCosmeticArt($('profileFrame'),frame,'frame');
}
function renderCosmeticArt(host,item,category){
 host.replaceChildren();
 host.className=category==='avatar'?'profile-avatar-art':'profile-frame';
 if(!item?.asset_url||!item.asset_url.startsWith('/assets/cosmetics/')){if(category==='avatar')appendSprite(host,'avatars.svg','avatar-starter-fox');return;}
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');
 const use=document.createElementNS('http://www.w3.org/2000/svg','use');
 use.setAttribute('href',item.asset_url);svg.append(use);host.append(svg);
}
async function loadCosmetics(){
 const host=$('cosmeticCatalog');if(!host)return;
 try{
  const catalog=await apiRequest('/cosmetics/catalog');
  let mine={owned:[],equipped:{}};
  if(caspianAuthToken)mine=await apiRequest('/cosmetics/mine');
  else if(caspianGuestToken)mine=await guestRequest('/guest/cosmetics/mine');
  drawProfile(mine.equipped,mine.owned);
  host.replaceChildren();
  catalog.items.forEach(item=>{
   const owned=mine.owned.some(x=>x.id===item.id);
   const equipped=mine.equipped?.[item.category==='avatar'?'avatar_cosmetic_id':'frame_cosmetic_id']===item.id;
   const card=document.createElement('article');card.className='cosmetic-card';
   const art=document.createElement('div');art.className='cosmetic-art';
   renderCosmeticArt(art,item,item.category);
   art.classList.add('cosmetic-art');
   const name=document.createElement('strong');name.className='cosmetic-name';name.textContent=item.name;
   const desc=document.createElement('p');desc.className='cosmetic-description';desc.textContent=item.description;
   const price=document.createElement('small');price.className='cosmetic-price';price.textContent=coinFormat(item.price_coins)+' سکه';
   const action=document.createElement('button');action.type='button';action.className='cosmetic-action';
   action.textContent=equipped?'استفاده شده':owned?'انتخاب برای پروفایل':caspianAuthToken?'خرید با سکه':item.price_coins===0?'دریافت رایگان':'برای خرید حساب بسازید';
   action.disabled=equipped;
   action.onclick=async()=>{
    if(!caspianAuthToken&&item.price_coins>0){$('phoneNumber').focus();cosmeticMessage('برای خرید این آیتم ابتدا حساب بسازید.');return;}
    action.disabled=true;
    try{
     if(owned){
      if(caspianAuthToken)await apiRequest('/cosmetics/equip',{method:'POST',body:JSON.stringify({cosmeticId:item.id})});else await guestRequest('/guest/cosmetics/equip',{method:'POST',body:JSON.stringify({cosmeticId:item.id})});
      cosmeticMessage('آیتم روی پروفایل شما فعال شد.');
     }else{
      const result=await apiRequest('/cosmetics/'+encodeURIComponent(item.id)+'/purchase',{method:'POST'});
      cosmeticMessage('خرید '+result.item.name+' موفق بود؛ موجودی کیف پول به‌روزرسانی شد.');
     }
     await refreshAccount();await loadCosmetics();
     if(roomCode&&playerId&&playerToken&&caspianAuthToken)socket.emit('refreshProfile',selectedPlayerCosmetics(),r=>{if(!r?.ok)cosmeticMessage(r?.error||'ظاهر اتاق هنوز به‌روزرسانی نشده است',true);});
    }catch(e){cosmeticMessage(e.message,true);action.disabled=false;}
   };
   card.append(art,name,desc,price,action);host.append(card);
  });
 }catch(e){host.textContent='بارگذاری فروشگاه آواتار و قاب ناموفق بود: '+e.message;}
}
if($('coinStore'))refreshAccount().then(loadCoinPackages);
if($('cosmeticsStore'))ensureGuestProfile().then(loadCosmetics);
async function loadSocialStore(){const host=$('socialCatalog');if(!host)return;try{const data=await apiRequest('/social/catalog');const owned=caspianAuthToken?(await apiRequest('/cosmetics/mine')).owned||[]:[];host.replaceChildren();data.items.forEach(item=>{const card=document.createElement('article');card.className='social-store-card';const art=document.createElement('div');art.className='social-store-art';art.textContent=item.id.includes('speaker')?'🔊':item.id.includes('vote')?'👑':'✨';const name=document.createElement('strong');name.textContent=item.name;const desc=document.createElement('p');desc.textContent=item.description;const price=document.createElement('small');price.textContent=coinFormat(item.price_coins)+' سکه';const buy=document.createElement('button');buy.type='button';buy.textContent=owned.some(x=>x.id===item.id)?'خریداری شده':caspianAuthToken?'خرید بسته':'ورود برای خرید';buy.disabled=owned.some(x=>x.id===item.id);buy.onclick=async()=>{if(!caspianAuthToken){$('phoneNumber').focus();$('socialStoreMessage').textContent='برای خرید بسته‌ها ابتدا وارد حساب شو.';return;}buy.disabled=true;try{const result=await apiRequest('/social/'+encodeURIComponent(item.id)+'/purchase',{method:'POST'});$('socialStoreMessage').textContent='بسته '+result.item.name+' به حساب شما اضافه شد.';await refreshAccount();await loadSocialStore();if(roomCode&&playerId&&playerToken)socket.emit('refreshProfile',selectedPlayerCosmetics(),r=>{if(!r?.ok)$('socialStoreMessage').textContent='بسته خریداری شد؛ برای فعال شدن در اتاق دوباره وارد شوید.';});}catch(e){$('socialStoreMessage').textContent=e.message;buy.disabled=false;}};card.append(art,name,desc,price,buy);host.append(card);});}catch(e){host.textContent='بارگذاری فروشگاه تعاملات ناموفق بود: '+e.message;}}
if($('socialStore'))loadSocialStore();

async function loadPublicRoomScenarios(){
 const select=$('publicRoomScenario');if(!select||select.dataset.loaded)return;
 try{const response=await fetch('/api/scenarios',{cache:'no-store'});const data=await response.json();(data.scenarios||[]).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);});select.dataset.loaded='true';}catch{}
}
async function loadPublicRooms(){
 const host=$('publicRoomList');if(!host)return;host.replaceChildren();const loading=document.createElement('p');loading.textContent='در حال دریافت اتاق‌های عمومی…';host.append(loading);
 try{
  const params=new URLSearchParams();const scenario=$('publicRoomScenario')?.value||'';if(scenario)params.set('scenarioId',scenario);
  const response=await fetch('/api/rooms?'+params.toString(),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'دریافت اتاق‌ها ناموفق بود');
  host.replaceChildren();
  if(!data.rooms?.length){const empty=document.createElement('p');empty.textContent='در حال حاضر اتاق عمومیِ قابل ورود پیدا نشد.';host.append(empty);}
  for(const room of data.rooms){
   const card=document.createElement('article');card.className='public-room-card';
   const title=document.createElement('strong');title.textContent=room.scenarioName;
   const meta=document.createElement('p');meta.textContent='کد '+room.code+' · '+room.players+' از '+room.capacity+' بازیکن · حداقل '+room.minPlayers+' نفر';
   const phase=document.createElement('small');phase.textContent=room.chatOpen?'لابی باز · گفت‌وگو فعال':'لابی باز · گفت‌وگو بسته';
   const joinButton=document.createElement('button');joinButton.type='button';joinButton.textContent='ورود به این اتاق';joinButton.disabled=room.players>=room.capacity;
   joinButton.onclick=()=>{$('code').value=room.code;$('join').click();};
   card.append(title,meta,phase,joinButton);host.append(card);
  }
  $('publicRoomsStatus').textContent='آخرین به‌روزرسانی: '+new Date(data.serverNow||Date.now()).toLocaleTimeString('fa-IR');
 }catch(error){host.replaceChildren();const message=document.createElement('p');message.textContent='اتصال به فهرست اتاق‌ها ممکن نشد: '+error.message;host.append(message);}
}
$('togglePublicRooms')?.addEventListener('click',async()=>{const panel=$('publicRoomsPanel');panel.classList.toggle('hidden');if(!panel.classList.contains('hidden')){await loadPublicRoomScenarios();await loadPublicRooms();panel.scrollIntoView({behavior:'smooth',block:'start'});}});
$('refreshPublicRooms')?.addEventListener('click',loadPublicRooms);
$('publicRoomScenario')?.addEventListener('change',loadPublicRooms);
