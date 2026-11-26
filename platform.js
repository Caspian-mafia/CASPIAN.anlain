'use strict';
const express=require('express');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const store=require('./persistence');
const router=express.Router();
const scrypt=promisify(crypto.scrypt);
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
const limits=new Map();
function rateLimit(req,res,next){
 const key=req.ip||req.socket.remoteAddress||'unknown',now=Date.now();
 const entry=limits.get(key)||{count:0,start:now};
 if(now-entry.start>60_000){entry.count=0;entry.start=now;}
 entry.count++;limits.set(key,entry);
 if(entry.count>30)return res.status(429).json({error:'تعداد درخواست‌ها بیش از حد مجاز است'});
 next();
}
function asyncRoute(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}
const STARTER_COSMETIC_IDS=['avatar-starter-fox','avatar-starter-cat','avatar-starter-owl','frame-starter'];
const cosmetics=require('./cosmetics');
function withCosmeticAsset(item){return cosmetics.withCosmeticAsset(item);}
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function validUsername(value){return /^[a-zA-Z0-9_]{3,24}$/.test(value);}
async function makePasswordHash(password){
 const salt=crypto.randomBytes(16).toString('hex');
 const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
 return 'scrypt$16384$8$1$'+salt+'$'+Buffer.from(derived).toString('hex');
}
async function verifyPassword(password,encoded){
 const parts=String(encoded||'').split('$');
 if(parts.length!==6||parts[0]!=='scrypt')return false;
 const [,n,r,p,salt,expected]=parts;
 if(!/^\d+$/.test(n)||!/^\d+$/.test(r)||!/^\d+$/.test(p)||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(expected))return false;
 const actual=Buffer.from(await scrypt(password,salt,64,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024}));
 return crypto.timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
async function issueSession(client,userId){
 const raw=token();
 await client.query('INSERT INTO caspian_sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL \'30 days\')',[userId,hashToken(raw)]);
 return raw;
}
async function guestAuth(req,res,next){
 const match=/^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get('authorization')||'');
 if(!match)return res.status(401).json({error:'شناسه مهمان معتبر نیست'});
 try{
  const {rows}=await store.query('SELECT id,claimed_by FROM caspian_guest_profiles WHERE token_hash=$1',[hashToken(match[1])]);
  if(!rows[0]||rows[0].claimed_by)return res.status(401).json({error:'پروفایل مهمان قبلاً به حساب منتقل شده یا معتبر نیست'});
  req.guest=rows[0];next();
 }catch(e){next(e);}
}
async function auth(req,res,next){
 const match=/^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get('authorization')||'');
 if(!match)return res.status(401).json({error:'ورود لازم است'});
 try{
  const {rows}=await store.query(`SELECT u.id,u.username,u.display_name
   FROM caspian_sessions s JOIN caspian_users u ON u.id=s.user_id
   WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.is_suspended=FALSE`,[hashToken(match[1])]);
  if(!rows[0])return res.status(401).json({error:'نشست معتبر نیست؛ دوباره وارد شوید'});
  req.user=rows[0];req.sessionToken=match[1];next();
 }catch(e){next(e);}
}

async function resolveRoomCosmetics({authToken='',guestToken=''}={}){
 if(process.env.CASPIAN_TEST_MEMORY==='1')return {avatarId:'avatar-starter-fox',frameId:'frame-starter'};
 const accountToken=String(authToken||''),anonymousToken=String(guestToken||'');
 if(/^[A-Za-z0-9_-]{40,}$/.test(accountToken)){
  const {rows}=await store.query(`SELECT u.avatar_cosmetic_id,u.frame_cosmetic_id
   FROM caspian_sessions s JOIN caspian_users u ON u.id=s.user_id
   WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,[hashToken(accountToken)]);
  if(rows[0])return {avatarId:rows[0].avatar_cosmetic_id||'avatar-starter-fox',frameId:rows[0].frame_cosmetic_id||'frame-starter'};
 }
 if(/^[A-Za-z0-9_-]{40,}$/.test(anonymousToken)){
  const {rows}=await store.query('SELECT avatar_cosmetic_id,frame_cosmetic_id FROM caspian_guest_profiles WHERE token_hash=$1 AND claimed_by IS NULL',[hashToken(anonymousToken)]);
  if(rows[0])return {avatarId:rows[0].avatar_cosmetic_id||'avatar-starter-fox',frameId:rows[0].frame_cosmetic_id||'frame-starter'};
 }
 return {avatarId:'avatar-starter-fox',frameId:'frame-starter'};
}
async function resolveRoomUserId({authToken=''}={}){
 if(process.env.CASPIAN_TEST_MEMORY==='1')return null;
 const accountToken=String(authToken||'');
 if(!/^[A-Za-z0-9_-]{40,}$/.test(accountToken))return null;
 const {rows}=await store.query(`SELECT u.id FROM caspian_sessions s JOIN caspian_users u ON u.id=s.user_id
  WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,[hashToken(accountToken)]);
 return rows[0]?.id||null;
}
async function resolveRoomSocialItems({authToken=''}={}){if(process.env.CASPIAN_TEST_MEMORY==='1')return [];const raw=String(authToken||'');if(!/^[A-Za-z0-9_-]{40,}$/.test(raw))return [];const {rows}=await store.query(`SELECT uc.cosmetic_id FROM caspian_user_cosmetics uc JOIN caspian_sessions s ON s.user_id=uc.user_id JOIN caspian_cosmetics c ON c.id=uc.cosmetic_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND c.category IN ('badge','sticker') AND c.active=TRUE`,[hashToken(raw)]);return [...new Set(rows.map(x=>x.cosmetic_id))];}
function calculatePrizeShares(userIds,prizePoolCoins=20_000){
 const ids=[...new Set(userIds.filter(Boolean).map(String))].sort();
 const pool=Number(prizePoolCoins);
 if(!Number.isSafeInteger(pool)||pool<0)throw new Error('مبلغ جایزه نامعتبر است');
 if(!ids.length||pool===0)return [];
 const base=Math.floor(pool/ids.length),remainder=pool%ids.length;
 return ids.map((userId,index)=>({userId,coins:base+(index<remainder?1:0)}));
}
async function settleGamePrize({roomCode,winner,players,prizePoolCoins=20_000}={}){
 if(!/^[A-Z0-9]{3,12}$/.test(String(roomCode||'')))throw new Error('شناسه اتاق برای تسویه نامعتبر است');
 const mafiaRoles=new Set(['مافیا','پدرخوانده','دکتر لکتر','گانگستر','مافیای سایه','استراتژیست']);
 const townRoles=new Set(['شهروند','کارآگاه','بازپرس','تکاور','پزشک','قاضی','محافظ','تک‌تیرانداز','هکر','خبرنگار','تحلیلگر']);
 const winningPlayers=(players||[]).filter(player=>{
  if(!player.userId)return false;
  if(winner==='mafia')return mafiaRoles.has(player.role);
  if(winner==='town')return townRoles.has(player.role);
  if(winner==='serial-killer')return player.role==='قاتل زنجیره‌ای';
  return false;
 });
 const shares=calculatePrizeShares(winningPlayers.map(player=>player.userId),prizePoolCoins);
 if(process.env.CASPIAN_TEST_MEMORY==='1')return {alreadySettled:false,prizePoolCoins:Number(prizePoolCoins),winnerCount:shares.length,distributedCoins:shares.reduce((sum,item)=>sum+item.coins,0)};
 return store.withTransaction(async client=>{
  const inserted=await client.query(`INSERT INTO caspian_game_payouts(room_code,winner,prize_pool_coins,winner_count,distributed_coins)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(room_code) DO NOTHING RETURNING room_code`,
   [roomCode,winner,String(prizePoolCoins),shares.length,String(shares.reduce((sum,item)=>sum+item.coins,0))]);
  if(!inserted.rows.length)return {alreadySettled:true,prizePoolCoins:Number(prizePoolCoins),winnerCount:shares.length,distributedCoins:0};
  for(const share of shares){
   const wallet=await client.query('SELECT balance FROM caspian_wallets WHERE user_id=$1 FOR UPDATE',[share.userId]);
   if(!wallet.rows[0])throw new Error('کیف پول حساب برنده پیدا نشد؛ تسویه جایزه باید rollback شود');
   const next=BigInt(wallet.rows[0].balance)+BigInt(share.coins);
   await client.query('UPDATE caspian_wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2',[next.toString(),share.userId]);
   await client.query(`INSERT INTO caspian_wallet_ledger(user_id,amount,balance_after,entry_type,reference_type,reference_id,idempotency_key,metadata)
    VALUES($1,$2,$3,'game_reward','game',$4,$5,$6::jsonb) ON CONFLICT(user_id,idempotency_key) DO NOTHING`,
    [share.userId,String(share.coins),next.toString(),roomCode,'game:'+roomCode,JSON.stringify({winner,prizePoolCoins:Number(prizePoolCoins),winnerCount:shares.length})]);
  }
  return {alreadySettled:false,prizePoolCoins:Number(prizePoolCoins),winnerCount:shares.length,distributedCoins:shares.reduce((sum,item)=>sum+item.coins,0)};
 });
}
function normalizeIranPhone(value){
 let digits=String(value||'').replace(/[\s()-]/g,'');
 if(/^09\d{9}$/.test(digits))digits='+98'+digits.slice(1);
 else if(/^9\d{9}$/.test(digits))digits='+98'+digits;
 else if(/^\+989\d{9}$/.test(digits)){}
 else return null;
 return digits;
}
async function sendPhoneOtp(phone,code){
 const key=process.env.KAVENEGAR_API_KEY,template=process.env.KAVENEGAR_OTP_TEMPLATE;
 if(!key||!template)throw new Error('سرویس پیامک تنظیم نشده است؛ KAVENEGAR_API_KEY و KAVENEGAR_OTP_TEMPLATE لازم است');
 const url=new URL('https://api.kavenegar.com/v1/'+encodeURIComponent(key)+'/verify/lookup.json');
 url.searchParams.set('receptor',phone);
 url.searchParams.set('token',code);
 url.searchParams.set('template',template);
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
 const data=await response.json();
 if(!response.ok||data?.return?.status!==200)throw new Error('ارسال پیامک تأیید ناموفق بود');
}
router.post('/auth/phone/request-otp',rateLimit,asyncRoute(async(req,res)=>{
 const phone=normalizeIranPhone(req.body?.phone);
 if(!phone)return res.status(400).json({error:'شماره موبایل ایران معتبر نیست؛ نمونه: 09123456789'});
 const recent=await store.query('SELECT last_sent_at FROM caspian_phone_otps WHERE phone_e164=$1',[phone]);
 if(recent.rows[0]&&Date.now()-new Date(recent.rows[0].last_sent_at).getTime()<60_000)return res.status(429).json({error:'برای ارسال دوباره کد، یک دقیقه صبر کنید'});
 const code=String(crypto.randomInt(0,1_000_000)).padStart(6,'0');
 await store.query(`INSERT INTO caspian_phone_otps(phone_e164,code_hash,expires_at,attempts,last_sent_at)
 VALUES($1,$2,NOW()+INTERVAL '5 minutes',0,NOW())
 ON CONFLICT(phone_e164) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,last_sent_at=NOW()`,[phone,hashToken(code)]);
 try{await sendPhoneOtp(phone,code);}catch(e){await store.query('DELETE FROM caspian_phone_otps WHERE phone_e164=$1',[phone]);throw e;}
 res.json({ok:true,message:'کد تأیید ارسال شد؛ تا ۵ دقیقه معتبر است.'});
}));
router.post('/auth/phone/verify',rateLimit,asyncRoute(async(req,res)=>{
 const registration=await store.query("SELECT setting_value FROM caspian_app_settings WHERE setting_key='registration_enabled'");
 const existingPhone=await store.query('SELECT id FROM caspian_users WHERE phone_e164=$1',[normalizeIranPhone(req.body?.phone)||'']);
 if(registration.rows[0]?.setting_value===false&&!existingPhone.rows[0])return res.status(403).json({error:'ثبت‌نام کاربران جدید موقتاً غیرفعال است'});
 const phone=normalizeIranPhone(req.body?.phone),code=String(req.body?.code||''),guestToken=String(req.body?.guestToken||''),displayName=String(req.body?.displayName||'').trim();
 if(!phone||!/^\d{6}$/.test(code))return res.status(400).json({error:'شماره یا کد تأیید نامعتبر است'});
 if(displayName.length>32)return res.status(400).json({error:'نام نمایشی حداکثر ۳۲ نویسه باشد'});
 if(guestToken&&!/^[A-Za-z0-9_-]{40,}$/.test(guestToken))return res.status(400).json({error:'شناسه مهمان نامعتبر است'});
 const result=await store.withTransaction(async client=>{
  const challenge=await client.query('SELECT code_hash,expires_at,attempts FROM caspian_phone_otps WHERE phone_e164=$1 FOR UPDATE',[phone]);
  const otp=challenge.rows[0];
  if(!otp||new Date(otp.expires_at).getTime()<Date.now()||otp.attempts>=5||otp.code_hash!==hashToken(code)){
   if(otp)await client.query('UPDATE caspian_phone_otps SET attempts=attempts+1 WHERE phone_e164=$1',[phone]);
   return {error:'کد تأیید اشتباه است یا منقضی شده است'};
  }
  await client.query('DELETE FROM caspian_phone_otps WHERE phone_e164=$1',[phone]);
  let user=(await client.query('SELECT id,username,display_name FROM caspian_users WHERE phone_e164=$1 FOR UPDATE',[phone])).rows[0];
  let created=false;
  if(!user){
   const suffix=phone.replace(/\D/g,'').slice(-10),username='mobile_'+suffix;
   const randomPasswordHash=await makePasswordHash(token());
   const inserted=await client.query(`INSERT INTO caspian_users(username,username_normalized,display_name,password_hash,phone_e164)
    VALUES($1,$1,$2,$3,$4) RETURNING id,username,display_name`,[username,displayName||'بازیکن '+suffix.slice(-4),randomPasswordHash,phone]);
   user=inserted.rows[0];created=true;
   await client.query('INSERT INTO caspian_wallets(user_id,balance) VALUES($1,0)',[user.id]);
   await client.query(`INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type)
    SELECT $1,id,'grant' FROM caspian_cosmetics WHERE id=ANY($2::text[]) ON CONFLICT DO NOTHING`,[user.id,STARTER_COSMETIC_IDS]);
   await client.query(`UPDATE caspian_users SET avatar_cosmetic_id='avatar-starter-fox',frame_cosmetic_id='frame-starter' WHERE id=$1`,[user.id]);
  }
  if(guestToken){
   const guest=(await client.query('SELECT id,avatar_cosmetic_id,frame_cosmetic_id FROM caspian_guest_profiles WHERE token_hash=$1 AND claimed_by IS NULL FOR UPDATE',[hashToken(guestToken)])).rows[0];
   if(guest){
    await client.query(`INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type)
     SELECT $1,cosmetic_id,'grant' FROM caspian_guest_cosmetics WHERE guest_id=$2 ON CONFLICT DO NOTHING`,[user.id,guest.id]);
    await client.query(`UPDATE caspian_users SET
     avatar_cosmetic_id=CASE WHEN EXISTS(SELECT 1 FROM caspian_guest_cosmetics WHERE guest_id=$2 AND cosmetic_id=$3) THEN $3 ELSE avatar_cosmetic_id END,
     frame_cosmetic_id=CASE WHEN EXISTS(SELECT 1 FROM caspian_guest_cosmetics WHERE guest_id=$2 AND cosmetic_id=$4) THEN $4 ELSE frame_cosmetic_id END
     WHERE id=$1`,[user.id,guest.id,guest.avatar_cosmetic_id,guest.frame_cosmetic_id]);
    await client.query('UPDATE caspian_guest_profiles SET claimed_by=$1,updated_at=NOW() WHERE id=$2',[user.id,guest.id]);
   }
  }
  const session=await issueSession(client,user.id);
  return {user,session,created};
 });
 if(result.error)return res.status(401).json({error:result.error});
 res.json({ok:true,user:result.user,token:result.session,tokenType:'Bearer',expiresIn:2592000,created:result.created});
}));

router.post('/auth/register',rateLimit,asyncRoute(async(req,res)=>{
 const registration=await store.query("SELECT setting_value FROM caspian_app_settings WHERE setting_key='registration_enabled'");
 if(registration.rows[0]?.setting_value===false)return res.status(403).json({error:'ثبت‌نام کاربران جدید موقتاً غیرفعال است'});
 const username=String(req.body?.username||'').trim(),normalized=normalizeUsername(username);
 const password=String(req.body?.password||''),displayName=String(req.body?.displayName||username).trim();
 if(!validUsername(username))return res.status(400).json({error:'نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد'});
 if(password.length<10||password.length>128)return res.status(400).json({error:'رمز عبور باید حداقل ۱۰ و حداکثر ۱۲۸ نویسه باشد'});
 if(!displayName||displayName.length>32)return res.status(400).json({error:'نام نمایشی نامعتبر است'});
 const passwordHash=await makePasswordHash(password);
 const guestToken=String(req.body?.guestToken||'');
 if(guestToken&&!/^[A-Za-z0-9_-]{40,}$/.test(guestToken))return res.status(400).json({error:'شناسه مهمان نامعتبر است'});
 try{
  const result=await store.withTransaction(async client=>{
   const created=await client.query('INSERT INTO caspian_users(username,username_normalized,display_name,password_hash) VALUES($1,$2,$3,$4) RETURNING id,username,display_name',[username,normalized,displayName,passwordHash]);
   await client.query('INSERT INTO caspian_wallets(user_id,balance) VALUES($1,0)',[created.rows[0].id]);
   await client.query(`INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type)
    SELECT $1,id,'grant' FROM caspian_cosmetics WHERE id=ANY($2::text[])
    ON CONFLICT(user_id,cosmetic_id) DO NOTHING`,[created.rows[0].id,STARTER_COSMETIC_IDS]);
   await client.query(`UPDATE caspian_users SET avatar_cosmetic_id='avatar-starter-fox',frame_cosmetic_id='frame-starter' WHERE id=$1`,[created.rows[0].id]);
   if(guestToken){
    const guest=await client.query('SELECT id,avatar_cosmetic_id,frame_cosmetic_id,claimed_by FROM caspian_guest_profiles WHERE token_hash=$1 FOR UPDATE',[hashToken(guestToken)]);
    if(guest.rows[0]&&!guest.rows[0].claimed_by){
     await client.query(`INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type)
      SELECT $1,cosmetic_id,'grant' FROM caspian_guest_cosmetics WHERE guest_id=$2
      ON CONFLICT(user_id,cosmetic_id) DO NOTHING`,[created.rows[0].id,guest.rows[0].id]);
     const selected=await client.query(`SELECT
      EXISTS(SELECT 1 FROM caspian_guest_cosmetics WHERE guest_id=$1 AND cosmetic_id=$2) AS has_avatar,
      EXISTS(SELECT 1 FROM caspian_guest_cosmetics WHERE guest_id=$1 AND cosmetic_id=$3) AS has_frame`,[guest.rows[0].id,guest.rows[0].avatar_cosmetic_id,guest.rows[0].frame_cosmetic_id]);
     await client.query(`UPDATE caspian_users SET
      avatar_cosmetic_id=CASE WHEN $2 AND EXISTS(SELECT 1 FROM caspian_cosmetics WHERE id=$3 AND category='avatar') THEN $3 ELSE avatar_cosmetic_id END,
      frame_cosmetic_id=CASE WHEN $4 AND EXISTS(SELECT 1 FROM caspian_cosmetics WHERE id=$5 AND category='frame') THEN $5 ELSE frame_cosmetic_id END
      WHERE id=$1`,[created.rows[0].id,selected.rows[0].has_avatar,guest.rows[0].avatar_cosmetic_id,selected.rows[0].has_frame,guest.rows[0].frame_cosmetic_id]);
     await client.query('UPDATE caspian_guest_profiles SET claimed_by=$1,updated_at=NOW() WHERE id=$2',[created.rows[0].id,guest.rows[0].id]);
    }
   }
   const session=await issueSession(client,created.rows[0].id);
   return {user:created.rows[0],session};
  });
  res.status(201).json({ok:true,user:result.user,token:result.session,tokenType:'Bearer',expiresIn:2592000});
 }catch(e){if(e.code==='23505')return res.status(409).json({error:'این نام کاربری قبلاً ثبت شده است'});throw e;}
}));
router.post('/auth/login',rateLimit,asyncRoute(async(req,res)=>{
 const username=normalizeUsername(req.body?.username),password=String(req.body?.password||'');
 if(!username||!password||password.length>128)return res.status(400).json({error:'نام کاربری یا رمز عبور نامعتبر است'});
 const {rows}=await store.query('SELECT id,username,display_name,password_hash,is_suspended FROM caspian_users WHERE username_normalized=$1',[username]);
 const user=rows[0];
 if(!user||!(await verifyPassword(password,user.password_hash)))return res.status(401).json({error:'نام کاربری یا رمز عبور اشتباه است'});
 if(user.is_suspended)return res.status(403).json({error:'این حساب توسط مدیریت تعلیق شده است'});
 const session=await store.withTransaction(client=>issueSession(client,user.id));
 res.json({ok:true,user:{id:user.id,username:user.username,display_name:user.display_name},token:session,tokenType:'Bearer',expiresIn:2592000});
}));
router.post('/auth/logout',auth,asyncRoute(async(req,res)=>{
 await store.query('UPDATE caspian_sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL',[hashToken(req.sessionToken)]);
 res.json({ok:true});
}));
router.get('/me',auth,asyncRoute(async(req,res)=>{
 const {rows}=await store.query('SELECT u.id,u.username,u.display_name,u.avatar_cosmetic_id,u.frame_cosmetic_id,w.balance FROM caspian_users u JOIN caspian_wallets w ON w.user_id=u.id WHERE u.id=$1',[req.user.id]);
 res.json({user:rows[0]});
}));
router.patch('/me',auth,asyncRoute(async(req,res)=>{
 const displayName=String(req.body?.displayName||'').trim();
 if(!displayName||displayName.length>32)return res.status(400).json({error:'نام نمایشی باید بین ۱ تا ۳۲ نویسه باشد'});
 const {rows}=await store.query('UPDATE caspian_users SET display_name=$1,updated_at=NOW() WHERE id=$2 RETURNING id,username,display_name',[displayName,req.user.id]);
 res.json({user:rows[0]});
}));


// Anonymous guest identity: one durable profile per browser/device until account claim.
router.post('/guest/session',rateLimit,asyncRoute(async(req,res)=>{
 const supplied=String(req.body?.guestToken||'');
 if(supplied&&!/^[A-Za-z0-9_-]{40,}$/.test(supplied))return res.status(400).json({error:'شناسه مهمان نامعتبر است'});
 if(supplied){
  const found=await store.query('SELECT id FROM caspian_guest_profiles WHERE token_hash=$1 AND claimed_by IS NULL',[hashToken(supplied)]);
  if(found.rows[0])return res.json({ok:true,guestToken:supplied});
 }
 const raw=token();
 await store.withTransaction(async client=>{
  const guest=await client.query('INSERT INTO caspian_guest_profiles(token_hash,avatar_cosmetic_id,frame_cosmetic_id) VALUES($1,$2,$3) RETURNING id',[hashToken(raw),'avatar-starter-fox','frame-starter']);
  await client.query(`INSERT INTO caspian_guest_cosmetics(guest_id,cosmetic_id) SELECT $1,id FROM caspian_cosmetics WHERE id=ANY($2::text[]) ON CONFLICT DO NOTHING`,[guest.rows[0].id,STARTER_COSMETIC_IDS]);
 });
 res.status(201).json({ok:true,guestToken:raw});
}));
router.get('/guest/cosmetics/mine',guestAuth,asyncRoute(async(req,res)=>{
 const {rows}=await store.query(`SELECT c.id,c.name,c.category,c.asset_url,c.rarity FROM caspian_guest_cosmetics gc JOIN caspian_cosmetics c ON c.id=gc.cosmetic_id WHERE gc.guest_id=$1 ORDER BY c.category,c.price_coins`,[req.guest.id]);
 const profile=await store.query('SELECT avatar_cosmetic_id,frame_cosmetic_id FROM caspian_guest_profiles WHERE id=$1',[req.guest.id]);
 res.json({owned:rows.map(withCosmeticAsset),equipped:profile.rows[0]||{}});
}));
router.post('/guest/cosmetics/equip',guestAuth,asyncRoute(async(req,res)=>{
 const cosmeticId=String(req.body?.cosmeticId||'');
 const result=await store.withTransaction(async client=>{
  const item=await client.query(`SELECT c.id,c.category FROM caspian_guest_cosmetics gc JOIN caspian_cosmetics c ON c.id=gc.cosmetic_id WHERE gc.guest_id=$1 AND c.id=$2 AND c.active=TRUE AND c.category IN ('avatar','frame')`,[req.guest.id,cosmeticId]);
  if(!item.rows[0])return {status:403,error:'این آیتم در اختیار پروفایل مهمان نیست'};
  const column=item.rows[0].category==='avatar'?'avatar_cosmetic_id':'frame_cosmetic_id';
  await client.query('UPDATE caspian_guest_profiles SET '+column+'=$1,updated_at=NOW() WHERE id=$2',[cosmeticId,req.guest.id]);
  return {status:200,ok:true};
 });
 res.status(result.status).json(result);
}));

router.get('/social/catalog',asyncRoute(async(_req,res)=>{const {rows}=await store.query("SELECT id,name,description,category,price_coins,rarity FROM caspian_cosmetics WHERE active=TRUE AND category IN ('badge','sticker') ORDER BY price_coins,id");res.json({items:rows});}));
router.post('/social/:id/purchase',auth,rateLimit,asyncRoute(async(req,res)=>{const id=String(req.params.id||'');if(!/^social-[a-z0-9-]{2,56}$/.test(id))return res.status(400).json({error:'شناسه بسته نامعتبر است'});const result=await store.withTransaction(async client=>{const item=(await client.query("SELECT id,name,price_coins FROM caspian_cosmetics WHERE id=$1 AND category='badge' AND active=TRUE FOR SHARE",[id])).rows[0];if(!item)return {status:404,error:'این بسته در فروشگاه موجود نیست'};const wallet=(await client.query('SELECT balance FROM caspian_wallets WHERE user_id=$1 FOR UPDATE',[req.user.id])).rows[0];if(!wallet)return {status:404,error:'کیف پول پیدا نشد'};const owned=await client.query('SELECT 1 FROM caspian_user_cosmetics WHERE user_id=$1 AND cosmetic_id=$2',[req.user.id,id]);if(owned.rows.length)return {status:409,error:'این بسته را قبلاً خریده‌اید'};const balance=BigInt(wallet.balance),price=BigInt(item.price_coins);if(balance<price)return {status:409,error:'موجودی سکه برای خرید کافی نیست',balance:balance.toString(),price:price.toString()};const next=balance-price;await client.query('UPDATE caspian_wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2',[next.toString(),req.user.id]);await client.query("INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type) VALUES($1,$2,'purchase')",[req.user.id,id]);await client.query("INSERT INTO caspian_wallet_ledger(user_id,amount,balance_after,entry_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,$2,$3,'cosmetic_purchase','social',$4,$5,$6::jsonb)",[req.user.id,(-price).toString(),next.toString(),id,'social:'+id,JSON.stringify({name:item.name,category:'badge'})]);return {status:200,ok:true,balance:next.toString(),item};});res.status(result.status).json(result);}));
router.get('/cosmetics/catalog',asyncRoute(async(_req,res)=>{
 const {rows}=await store.query("SELECT id,name,description,category,price_coins,asset_url,rarity FROM caspian_cosmetics WHERE active=TRUE AND category IN ('avatar','frame','sticker') ORDER BY category,price_coins,id");
 res.json({items:rows.map(withCosmeticAsset)});
}));
router.get('/cosmetics/mine',auth,asyncRoute(async(req,res)=>{
 const {rows}=await store.query("SELECT c.id,c.name,c.category,c.asset_url,c.rarity,uc.acquired_at FROM caspian_user_cosmetics uc JOIN caspian_cosmetics c ON c.id=uc.cosmetic_id WHERE uc.user_id=$1 ORDER BY uc.acquired_at DESC",[req.user.id]);
 const profile=await store.query('SELECT avatar_cosmetic_id,frame_cosmetic_id FROM caspian_users WHERE id=$1',[req.user.id]);
 res.json({owned:rows.map(withCosmeticAsset),equipped:profile.rows[0]||{}});
}));
router.post('/cosmetics/:id/purchase',auth,rateLimit,asyncRoute(async(req,res)=>{
 const cosmeticId=String(req.params.id||'');
 if(!/^[a-z0-9-]{2,64}$/.test(cosmeticId))return res.status(400).json({error:'شناسه آیتم نامعتبر است'});
 const result=await store.withTransaction(async client=>{
  const item=await client.query("SELECT id,name,category,price_coins FROM caspian_cosmetics WHERE id=$1 AND active=TRUE AND category IN ('avatar','frame','sticker') FOR SHARE",[cosmeticId]);
  if(!item.rows[0])return {status:404,error:'این آیتم در فروشگاه موجود نیست'};
  const cosmetic=item.rows[0];
  const wallet=await client.query('SELECT balance FROM caspian_wallets WHERE user_id=$1 FOR UPDATE',[req.user.id]);
  if(!wallet.rows[0])return {status:404,error:'کیف پول پیدا نشد'};
  const owned=await client.query('SELECT 1 FROM caspian_user_cosmetics WHERE user_id=$1 AND cosmetic_id=$2',[req.user.id,cosmeticId]);
  if(owned.rows.length)return {status:409,error:'این آیتم را قبلاً خریده‌اید'};
  const balance=BigInt(wallet.rows[0].balance),price=BigInt(cosmetic.price_coins);
  if(balance<price)return {status:409,error:'موجودی سکه برای خرید کافی نیست',balance:balance.toString(),price:price.toString()};
  const next=balance-price;
  await client.query('UPDATE caspian_wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2',[next.toString(),req.user.id]);
  await client.query("INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type) VALUES($1,$2,'purchase')",[req.user.id,cosmeticId]);
  await client.query("INSERT INTO caspian_wallet_ledger(user_id,amount,balance_after,entry_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,$2,$3,'cosmetic_purchase','cosmetic',$4,$5,$6::jsonb)",[req.user.id,(-price).toString(),next.toString(),cosmeticId,'cosmetic:'+cosmeticId,JSON.stringify({name:cosmetic.name,category:cosmetic.category})]);
  return {status:200,ok:true,balance:next.toString(),item:cosmetic};
 });
 res.status(result.status).json(result);
}));
router.post('/cosmetics/equip',auth,asyncRoute(async(req,res)=>{
 const cosmeticId=String(req.body?.cosmeticId||'');
 const result=await store.withTransaction(async client=>{
  const owned=await client.query("SELECT c.id,c.category FROM caspian_user_cosmetics uc JOIN caspian_cosmetics c ON c.id=uc.cosmetic_id WHERE uc.user_id=$1 AND c.id=$2 AND c.active=TRUE AND c.category IN ('avatar','frame')",[req.user.id,cosmeticId]);
  const item=owned.rows[0];
  if(!item)return {status:403,error:'ابتدا باید این آیتم را داشته باشید'};
  const column=item.category==='avatar'?'avatar_cosmetic_id':'frame_cosmetic_id';
  await client.query('UPDATE caspian_users SET '+column+'=$1,updated_at=NOW() WHERE id=$2',[item.id,req.user.id]);
  return {status:200,ok:true,equipped:{[column]:item.id}};
 });
 res.status(result.status).json(result);
}));
const COIN_CATALOG=[{"id":"coins-100","coins":100,"amountRial":1000000},{"id":"coins-500","coins":500,"amountRial":2000000},{"id":"coins-2000","coins":2000,"amountRial":3500000},{"id":"coins-3000","coins":3000,"amountRial":5000000},{"id":"coins-5000","coins":5000,"amountRial":7500000},{"id":"coins-10000","coins":10000,"amountRial":10000000},{"id":"coins-15000","coins":15000,"amountRial":15000000},{"id":"coins-20000","coins":20000,"amountRial":20000000},{"id":"coins-30000","coins":30000,"amountRial":30000000},{"id":"coins-40000","coins":40000,"amountRial":40000000},{"id":"coins-50000","coins":50000,"amountRial":50000000}];
function coinPackages(extraConfigured=[]){
 let configured=[];try{const parsed=JSON.parse(process.env.CASPIAN_COIN_PACKAGES||'[]');if(Array.isArray(parsed))configured=parsed;}catch{}
 if(Array.isArray(extraConfigured))for(const p of extraConfigured)if(p&&typeof p.id==='string'){const i=configured.findIndex(x=>x.id===p.id);if(i>=0)configured[i]=p;else configured.push(p);}
 const byId=new Map(configured.filter(p=>p&&typeof p.id==='string').map(p=>[p.id,p]));
 return COIN_CATALOG.map(item=>{const price=byId.get(item.id);const configuredRial=price?.amountRial;const validConfigured=Number.isSafeInteger(configuredRial)&&configuredRial>=1000&&configuredRial<=500_000_000;const amountRial=price?(validConfigured?configuredRial:null):item.amountRial;return {...item,amountRial};});
}
async function loadCoinPackages(){
 let saved=[];try{const result=await store.query("SELECT setting_value FROM caspian_app_settings WHERE setting_key='coin_packages'");if(result.rows[0]){const value=result.rows[0].setting_value;saved=Array.isArray(value)?value:JSON.parse(value);}}catch{}
 return coinPackages(saved);
}
function gatewayConfig(){
 const sandbox=process.env.ZARINPAL_SANDBOX!=='false';
 const host=sandbox?'https://sandbox.zarinpal.com':'https://api.zarinpal.com';
 const start=sandbox?'https://sandbox.zarinpal.com/pg/StartPay/':'https://www.zarinpal.com/pg/StartPay/';
 return {sandbox,requestUrl:host+'/pg/v4/payment/request.json',verifyUrl:host+'/pg/v4/payment/verify.json',startUrl:start};
}
async function gatewayPost(url,payload){
 const response=await fetch(url,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12_000)});
 const body=await response.json();
 if(!response.ok)throw new Error('درگاه پرداخت پاسخ ناموفق داد');
 return body;
}
router.get('/payments/packages',asyncRoute(async(_req,res)=>{
 const packages=await loadCoinPackages();
 res.json({currency:'IRR',sandbox:process.env.ZARINPAL_SANDBOX!=='false',packages:packages.map(({id,amountRial,coins})=>({id,amountRial,coins}))});
}));
router.post('/payments/zarinpal/create',auth,rateLimit,asyncRoute(async(req,res)=>{
 const merchantId=process.env.ZARINPAL_MERCHANT_ID,base=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL;
 if(!merchantId||!base)return res.status(503).json({error:'تنظیمات درگاه کامل نیست؛ شناسه پذیرنده و آدرس عمومی سرور لازم است'});
 const pkg=(await loadCoinPackages()).find(p=>p.id===req.body?.packageId);
 if(!pkg)return res.status(400).json({error:'بسته سکه معتبر نیست'});
 if(!Number.isSafeInteger(pkg.amountRial))return res.status(409).json({error:'قیمت این بسته هنوز تعیین نشده است'});
 const orderId=crypto.randomUUID(),idempotencyKey='zp:'+orderId;
 await store.query(`INSERT INTO caspian_coin_orders(id,user_id,provider,amount_minor,currency,coins,status,idempotency_key)
 VALUES($1,$2,'zarinpal',$3,'IRR',$4,'pending',$5)`,[orderId,req.user.id,pkg.amountRial,pkg.coins,idempotencyKey]);
 const callback=new URL('/api/payments/zarinpal/callback',base);
 callback.searchParams.set('orderId',orderId);
 try{
  const cfg=gatewayConfig();
  const result=await gatewayPost(cfg.requestUrl,{merchant_id:merchantId,amount:pkg.amountRial,callback_url:callback.toString(),description:'خرید سکه CASPIAN',metadata:{order_id:orderId}});
  if(result?.data?.code!==100||!result?.data?.authority)throw new Error('درگاه درخواست پرداخت را نپذیرفت');
  await store.query("UPDATE caspian_coin_orders SET provider_reference=$1,updated_at=NOW() WHERE id=$2 AND status='pending'",[result.data.authority,orderId]);
  res.status(201).json({ok:true,orderId,authority:result.data.authority,paymentUrl:cfg.startUrl+encodeURIComponent(result.data.authority),amountRial:pkg.amountRial,coins:pkg.coins,sandbox:cfg.sandbox});
 }catch(e){
  await store.query("UPDATE caspian_coin_orders SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",[orderId]);
  throw e;
 }
}));
router.get('/payments/zarinpal/callback',asyncRoute(async(req,res)=>{
 const orderId=String(req.query.orderId||''),authority=String(req.query.Authority||''),status=String(req.query.Status||'');
 if(!/^[0-9a-f-]{36}$/i.test(orderId)||!authority||authority.length>160)return res.status(400).send('درخواست بازگشت پرداخت نامعتبر است.');
 const {rows}=await store.query("SELECT id,user_id,amount_minor,coins,status,provider_reference FROM caspian_coin_orders WHERE id=$1 AND provider='zarinpal'",[orderId]);
 const order=rows[0];
 if(!order)return res.status(404).send('سفارش پیدا نشد.');
 if(order.status==='paid')return res.status(200).send('پرداخت قبلاً تأیید و سکه‌ها به کیف پول افزوده شده‌اند. می‌توانید به CASPIAN بازگردید.');
 if(order.status!=='pending'||order.provider_reference!==authority)return res.status(409).send('سفارش در انتظار این پرداخت نیست.');
 if(status!=='OK'){
  await store.query("UPDATE caspian_coin_orders SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",[orderId]);
  return res.status(200).send('پرداخت انجام نشد یا توسط کاربر لغو شد.');
 }
 const merchantId=process.env.ZARINPAL_MERCHANT_ID;
 if(!merchantId)return res.status(503).send('تنظیمات پذیرنده پرداخت کامل نیست.');
 const cfg=gatewayConfig();
 const verified=await gatewayPost(cfg.verifyUrl,{merchant_id:merchantId,amount:Number(order.amount_minor),authority});
 if(![100,101].includes(verified?.data?.code))return res.status(402).send('تأیید پرداخت موفق نبود؛ کیف پول شارژ نشد.');
 const refId=String(verified.data.ref_id||'');
 if(!refId)return res.status(502).send('شناسه مرجع پرداخت از درگاه دریافت نشد.');
 await store.withTransaction(async client=>{
  const locked=await client.query("SELECT * FROM caspian_coin_orders WHERE id=$1 FOR UPDATE",[orderId]);
  const current=locked.rows[0];
  if(!current||current.status==='paid')return;
  if(current.status!=='pending'||current.provider_reference!==authority)throw new Error('سفارش در زمان تأیید تغییر کرده است');
  const wallet=await client.query('SELECT balance FROM caspian_wallets WHERE user_id=$1 FOR UPDATE',[current.user_id]);
  if(!wallet.rows[0])throw new Error('کیف پول کاربر پیدا نشد');
  const next=BigInt(wallet.rows[0].balance)+BigInt(current.coins);
  await client.query('UPDATE caspian_wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2',[next.toString(),current.user_id]);
  await client.query(`INSERT INTO caspian_wallet_ledger(user_id,amount,balance_after,entry_type,reference_type,reference_id,idempotency_key,metadata)
   VALUES($1,$2,$3,'purchase','coin_order',$4,$5,$6::jsonb)`,[current.user_id,String(current.coins),next.toString(),orderId,'payment:'+orderId,JSON.stringify({provider:'zarinpal',refId})]);
  await client.query("UPDATE caspian_coin_orders SET status='paid',provider_reference=$1,updated_at=NOW() WHERE id=$2",[refId,orderId]);
 });
 res.status(200).send('پرداخت تأیید شد و سکه‌ها به کیف پول افزوده شدند. می‌توانید به CASPIAN بازگردید.');
}));
router.use('/birthday',require('./birthday-api'));
router.use((err,_req,res,_next)=>{
 console.error('CASPIAN platform API error:',err.message);
 if(!res.headersSent)res.status(500).json({error:'خطای داخلی؛ دوباره تلاش کنید'});
});
module.exports={router,auth,guestAuth,coinPackages,verifyPassword,makePasswordHash,STARTER_COSMETIC_IDS,withCosmeticAsset,normalizeIranPhone,resolveRoomCosmetics,resolveRoomUserId,resolveRoomSocialItems,calculatePrizeShares,settleGamePrize};
