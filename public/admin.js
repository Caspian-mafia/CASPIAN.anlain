'use strict';
const q=new URLSearchParams(location.search),room=q.get('room'),key=localStorage.getItem('caspianHost')||sessionStorage.getItem('caspianHost')||'',$=id=>document.getElementById(id);
const roleNames=['پدرخوانده','دکتر لکتر','مافیا','کارآگاه','پزشک','شهروند','قاتل زنجیره‌ای','مستقل'];
const fields=['investigatorResult','independentInvestigation','mafiaTieBreak','mafiaWin','serialKillerWin'];
function status(t,bad=false){$('status').textContent=t;$('status').style.color=bad?'#ff8f8f':'#a9d7b1';}
async function request(method='GET',body){const r=await fetch('/api/scenario?room='+encodeURIComponent(room||''),{method,headers:{'x-host-key':key||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'خطا');return d;}
function fill(s){$('scenarioName').value=s.name||'';for(const role of roleNames)$(role).value=s.roleCounts[role]||0;for(const k of fields)$(k).value=s[k];total();}
function total(){const n=roleNames.reduce((a,r)=>a+Number($(r).value||0),0);$('total').textContent='مجموع: '+n+' از ۱۶';$('total').style.color=n===16?'#a9d7b1':'#ff8f8f';return n;}
roleNames.forEach(r=>$(r).addEventListener('input',total));
request().then(fill).then(()=>status('تنظیمات بارگذاری شد')).catch(e=>status(e.message,true));
$('save').onclick=async()=>{try{if(total()!==16)throw Error('مجموع نقش‌ها باید دقیقاً ۱۶ باشد');const scenario={name:$('scenarioName').value,roleCounts:Object.fromEntries(roleNames.map(r=>[r,Number($(r).value)])),godfatherOverride:true};for(const k of fields)scenario[k]=$(k).value;const saved=await request('PUT',scenario);fill(saved.scenario);status('سناریو ذخیره شد');}catch(e){status(e.message,true);}};