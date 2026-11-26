'use strict';
const express=require('express');
const crypto=require('node:crypto');
const store=require('./persistence');
const router=express.Router();
const UNLOCK=20000;
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function auth(req,res,next){
 const match=/^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get('authorization')||'');
 if(!match)return res.status(401).json({error:'ورود لازم است'});
 store.query("SELECT u.id,u.username,u.display_name FROM caspian_sessions s JOIN caspian_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.is_suspended=FALSE",[hash(match[1])])
 .then(({rows})=>{if(!rows[0])return res.status(401).json({error:'نشست معتبر نیست'});req.user=rows[0];next();}).catch(next);
}
async function member(db,roomId,userId){
 const {rows}=await db.query("SELECT s.* FROM caspian_birthday_room_sessions s JOIN caspian_birthday_room_participants p ON p.birthday_room_id=s.id WHERE s.id=$1 AND p.user_id=$2",[roomId,userId]);
 return rows[0]||null;
}
router.use(auth);
router.post('/rooms',asyncRoute(async(req,res)=>{
 const theme=String(req.body?.themeId||'royal-purple');
 const honoree=String(req.body?.honoreeUserId||'');
 const layout=String(req.body?.layout||'circle');
 const guests=Number(req.body?.guestCount||8);
 if(!/^[a-z0-9-]{2,64}$/i.test(theme)||!uuid.test(honoree)||!['circle','semicircle','staggered','two-sided'].includes(layout)||!Number.isInteger(guests)||guests<2||guests>16)
  return res.status(400).json({error:'تنظیمات اتاق یا شناسه فرد مورد تجلیل معتبر نیست'});
 const id=crypto.randomUUID(),code=crypto.randomBytes(4).toString('hex').toUpperCase();
 const result=await store.withTransaction(async db=>{
  const target=await db.query('SELECT id FROM caspian_users WHERE id=$1',[honoree]);
  if(!target.rows[0])return {status:404,error:'حساب فرد مورد تجلیل پیدا نشد'};
  const wallet=await db.query('SELECT balance FROM caspian_wallets WHERE user_id=$1 FOR UPDATE',[req.user.id]);
  if(!wallet.rows[0])return {status:404,error:'کیف پول پیدا نشد'};
  const balance=BigInt(wallet.rows[0].balance);
  if(balance<BigInt(UNLOCK))return {status:409,error:'برای بازکردن اتاق ۲۰٬۰۰۰ سکه لازم است',balance:balance.toString(),requiredCoins:UNLOCK};
  const next=balance-BigInt(UNLOCK);
  await db.query('UPDATE caspian_wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2',[next.toString(),req.user.id]);
  await db.query("INSERT INTO caspian_wallet_ledger(user_id,amount,balance_after,entry_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,$2,$3,'birthday_room_unlock','birthday_room',$4,$5,$6::jsonb)",
   [req.user.id,String(-UNLOCK),next.toString(),id,'birthday-unlock:'+id,JSON.stringify({roomCode:code,themeId:theme})]);
  await db.query("INSERT INTO caspian_room_directory(room_code,owner_id,visibility,status,max_players,entry_fee,prize_pool,state) VALUES($1,$2,'private','waiting',16,0,0,$3::jsonb)",
   [code,req.user.id,JSON.stringify({kind:'birthday',birthdayRoomId:id})]);
  await db.query("INSERT INTO caspian_birthday_room_sessions(id,owner_user_id,room_code,honoree_user_id,theme_id,unlock_fee_coins,owner_unlock_paid,room_locked,room_visibility,status,room_settings) VALUES($1,$2,$3,$4,$5,20000,TRUE,TRUE,'private','open',$6::jsonb)",
   [id,req.user.id,code,honoree,theme,JSON.stringify({layout,guestCount:guests})]);
  await db.query("INSERT INTO caspian_birthday_room_participants(birthday_room_id,user_id,member_role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",[id,req.user.id]);
  await db.query("INSERT INTO caspian_birthday_room_participants(birthday_room_id,user_id,member_role) VALUES($1,$2,'honoree') ON CONFLICT DO NOTHING",[id,honoree]);
  await db.query("INSERT INTO caspian_birthday_events(room_code,host_user_id,honoree_user_id,theme_id,status) VALUES($1,$2,$3,$4,'scheduled')",[code,req.user.id,honoree,theme]);
  return {status:201,ok:true,room:{id,roomCode:code,themeId:theme,honoreeUserId:honoree,layout,guestCount:guests,status:'open',locked:true,unlockFeeCoins:UNLOCK},balance:next.toString()};
 });
 res.status(result.status).json(result);
}));
router.get('/rooms',asyncRoute(async(req,res)=>{
 const {rows}=await store.query("SELECT s.id,s.room_code AS \"roomCode\",s.theme_id AS \"themeId\",s.honoree_user_id AS \"honoreeUserId\",s.status,s.room_locked AS locked,s.room_settings AS settings,p.member_role AS \"memberRole\",s.created_at AS \"createdAt\" FROM caspian_birthday_room_sessions s JOIN caspian_birthday_room_participants p ON p.birthday_room_id=s.id WHERE p.user_id=$1 AND s.status IN ('open','active') ORDER BY s.created_at DESC",[req.user.id]);
 res.json({rooms:rows});
}));
router.get('/rooms/:id',asyncRoute(async(req,res)=>{
 if(!uuid.test(req.params.id))return res.status(400).json({error:'شناسه اتاق معتبر نیست'});
 const room=await member(store,req.params.id,req.user.id);
 if(!room)return res.status(404).json({error:'اتاق پیدا نشد یا دسترسی ندارید'});
 const {rows}=await store.query("SELECT p.user_id AS \"userId\",u.display_name AS \"displayName\",p.member_role AS \"memberRole\" FROM caspian_birthday_room_participants p JOIN caspian_users u ON u.id=p.user_id WHERE p.birthday_room_id=$1 ORDER BY p.joined_at",[room.id]);
 res.json({room:{id:room.id,roomCode:room.room_code,themeId:room.theme_id,honoreeUserId:room.honoree_user_id,status:room.status,locked:room.room_locked,settings:room.room_settings},participants:rows});
}));
router.post('/rooms/:id/invites',asyncRoute(async(req,res)=>{
 const id=req.params.id;if(!uuid.test(id))return res.status(400).json({error:'شناسه اتاق معتبر نیست'});
 const code=crypto.randomBytes(24).toString('base64url');
 const max=req.body?.maxUses===undefined?null:Number(req.body.maxUses);
 const hours=req.body?.expiresInHours===undefined?72:Number(req.body.expiresInHours);
 if((max!==null&&(!Number.isInteger(max)||max<1||max>500))||!Number.isInteger(hours)||hours<1||hours>720)return res.status(400).json({error:'محدودیت دعوت‌نامه معتبر نیست'});
 const result=await store.withTransaction(async db=>{
  const room=(await db.query('SELECT owner_user_id,status FROM caspian_birthday_room_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!room)return {status:404,error:'اتاق پیدا نشد'};
  if(room.owner_user_id!==req.user.id)return {status:403,error:'فقط صاحب اتاق می‌تواند دعوت صادر کند'};
  if(!['open','active'].includes(room.status))return {status:409,error:'اتاق بسته است'};
  await db.query('UPDATE caspian_birthday_room_invites SET revoked_at=NOW() WHERE birthday_room_id=$1 AND revoked_at IS NULL',[id]);
  const inserted=await db.query("INSERT INTO caspian_birthday_room_invites(birthday_room_id,code_hash,created_by,max_uses,expires_at) VALUES($1,$2,$3,$4,NOW()+($5::text||' hours')::interval) RETURNING id,expires_at,max_uses",[id,hash(code),req.user.id,max,hours]);
  return {status:201,ok:true,invite:{id:inserted.rows[0].id,code,expiresAt:inserted.rows[0].expires_at,maxUses:inserted.rows[0].max_uses}};
 });
 res.status(result.status).json(result);
}));
router.post('/rooms/:id/join',asyncRoute(async(req,res)=>{
 const id=req.params.id,code=String(req.body?.inviteCode||'');
 if(!uuid.test(id)||!/^[A-Za-z0-9_-]{24,64}$/.test(code))return res.status(400).json({error:'کد دعوت معتبر نیست'});
 const result=await store.withTransaction(async db=>{
  const room=(await db.query('SELECT id,status,room_settings FROM caspian_birthday_room_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!room||!['open','active'].includes(room.status))return {status:404,error:'اتاق تولد در دسترس نیست'};
  const existing=await db.query('SELECT 1 FROM caspian_birthday_room_participants WHERE birthday_room_id=$1 AND user_id=$2',[id,req.user.id]);
  if(existing.rows.length)return {status:200,ok:true,alreadyJoined:true};
  const guestLimit=Math.max(2,Math.min(16,Number(room.room_settings?.guestCount)||8));
  const guestCount=await db.query("SELECT COUNT(*)::int AS count FROM caspian_birthday_room_participants WHERE birthday_room_id=$1 AND member_role='guest'",[id]);
  if(guestCount.rows[0].count>=guestLimit)return {status:409,error:'ظرفیت مهمانان این اتاق تکمیل شده است',guestLimit};
  const invite=(await db.query('SELECT id,max_uses,uses_count,expires_at,revoked_at FROM caspian_birthday_room_invites WHERE birthday_room_id=$1 AND code_hash=$2 FOR UPDATE',[id,hash(code)])).rows[0];
  if(!invite||invite.revoked_at||new Date(invite.expires_at).getTime()<=Date.now()||(invite.max_uses!==null&&invite.uses_count>=invite.max_uses))return {status:403,error:'کد دعوت نامعتبر، منقضی یا تمام‌شده است'};
  await db.query("INSERT INTO caspian_birthday_room_participants(birthday_room_id,user_id,member_role) VALUES($1,$2,'guest') ON CONFLICT DO NOTHING",[id,req.user.id]);
  await db.query("UPDATE caspian_birthday_room_sessions SET status='active',updated_at=NOW() WHERE id=$1 AND status='open'",[id]);
  await db.query('UPDATE caspian_birthday_room_invites SET uses_count=uses_count+1 WHERE id=$1',[invite.id]);
  return {status:200,ok:true,joined:true};
 });
 res.status(result.status).json(result);
}));
router.post('/rooms/:id/gifts',asyncRoute(async(req,res)=>{
 const id=req.params.id,recipient=String(req.body?.recipientUserId||''),cosmetic=String(req.body?.cosmeticId||'');
 if(!uuid.test(id)||!uuid.test(recipient)||!/^[a-z0-9-]{2,64}$/.test(cosmetic)||recipient===req.user.id)return res.status(400).json({error:'گیرنده یا آیتم هدیه معتبر نیست'});
 const result=await store.withTransaction(async db=>{
  const room=await member(db,id,req.user.id);
  if(!room||!['open','active'].includes(room.status))return {status:403,error:'برای هدیه‌دادن باید عضو اتاق باز باشید'};
  const target=await db.query('SELECT 1 FROM caspian_birthday_room_participants WHERE birthday_room_id=$1 AND user_id=$2',[id,recipient]);
  if(!target.rows.length)return {status:404,error:'گیرنده عضو اتاق نیست'};
  const item=await db.query("SELECT c.id,c.name,c.category FROM caspian_user_cosmetics uc JOIN caspian_cosmetics c ON c.id=uc.cosmetic_id WHERE uc.user_id=$1 AND c.id=$2 AND c.active=TRUE AND c.category IN ('avatar','frame') FOR UPDATE OF uc",[req.user.id,cosmetic]);
  if(!item.rows[0])return {status:403,error:'برای هدیه‌دادن باید مالک آواتور یا قاب باشید'};
  const owned=await db.query('SELECT 1 FROM caspian_user_cosmetics WHERE user_id=$1 AND cosmetic_id=$2',[recipient,cosmetic]);
  if(owned.rows.length)return {status:409,error:'گیرنده این آیتم را از قبل دارد'};
  await db.query('DELETE FROM caspian_user_cosmetics WHERE user_id=$1 AND cosmetic_id=$2',[req.user.id,cosmetic]);
  await db.query("INSERT INTO caspian_user_cosmetics(user_id,cosmetic_id,acquisition_type) VALUES($1,$2,'reward') ON CONFLICT DO NOTHING",[recipient,cosmetic]);
  await db.query("UPDATE caspian_users SET avatar_cosmetic_id=CASE WHEN avatar_cosmetic_id=$1 THEN 'avatar-starter-fox' ELSE avatar_cosmetic_id END,frame_cosmetic_id=CASE WHEN frame_cosmetic_id=$1 THEN 'frame-starter' ELSE frame_cosmetic_id END WHERE id=$2",[cosmetic,req.user.id]);
  const gift=await db.query("INSERT INTO caspian_birthday_room_gift_deliveries(birthday_room_id,sender_user_id,recipient_user_id,cosmetic_id,gift_status) VALUES($1,$2,$3,$4,'delivered') RETURNING id,created_at",[id,req.user.id,recipient,cosmetic]);
  return {status:201,ok:true,gift:{id:gift.rows[0].id,cosmeticId:cosmetic,name:item.rows[0].name,category:item.rows[0].category,deliveredAt:gift.rows[0].created_at}};
 });
 res.status(result.status).json(result);
}));
router.get('/rooms/:id/gifts',asyncRoute(async(req,res)=>{
 const id=req.params.id;if(!uuid.test(id))return res.status(400).json({error:'شناسه اتاق معتبر نیست'});
 if(!await member(store,id,req.user.id))return res.status(404).json({error:'اتاق پیدا نشد یا دسترسی ندارید'});
 const {rows}=await store.query('SELECT g.id,g.sender_user_id AS "senderUserId",s.display_name AS "senderName",g.recipient_user_id AS "recipientUserId",r.display_name AS "recipientName",g.cosmetic_id AS "cosmeticId",c.name AS "cosmeticName",c.category,g.created_at AS "createdAt" FROM caspian_birthday_room_gift_deliveries g JOIN caspian_users s ON s.id=g.sender_user_id JOIN caspian_users r ON r.id=g.recipient_user_id JOIN caspian_cosmetics c ON c.id=g.cosmetic_id WHERE g.birthday_room_id=$1 ORDER BY g.created_at DESC',[id]);
 res.json({gifts:rows});
}));

router.get('/rooms/:id/messages',asyncRoute(async(req,res)=>{
 const id=req.params.id;if(!uuid.test(id))return res.status(400).json({error:'شناسه اتاق معتبر نیست'});
 if(!await member(store,id,req.user.id))return res.status(404).json({error:'اتاق پیدا نشد یا دسترسی ندارید'});
 const {rows}=await store.query('SELECT m.id,m.sender_user_id AS "senderUserId",u.display_name AS "senderName",m.body,m.created_at AS "createdAt" FROM caspian_birthday_room_messages m JOIN caspian_users u ON u.id=m.sender_user_id WHERE m.birthday_room_id=$1 ORDER BY m.created_at DESC LIMIT 50',[id]);
 res.json({messages:rows.reverse()});
}));

router.post('/rooms/:id/close',asyncRoute(async(req,res)=>{
 const id=req.params.id;if(!uuid.test(id))return res.status(400).json({error:'شناسه اتاق معتبر نیست'});
 const result=await store.withTransaction(async db=>{
  const room=(await db.query('SELECT * FROM caspian_birthday_room_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!room)return {status:404,error:'اتاق پیدا نشد'};
  if(room.owner_user_id!==req.user.id)return {status:403,error:'فقط صاحب اتاق می‌تواند اتاق را ببندد'};
  await db.query("UPDATE caspian_birthday_room_sessions SET status='closed',room_locked=TRUE,updated_at=NOW() WHERE id=$1",[id]);
  await db.query("UPDATE caspian_room_directory SET status='closed',updated_at=NOW() WHERE room_code=$1",[room.room_code]);
  await db.query("UPDATE caspian_birthday_events SET status='completed',completed_at=NOW() WHERE room_code=$1 AND status IN ('scheduled','active')",[room.room_code]);
  await db.query('UPDATE caspian_birthday_room_invites SET revoked_at=NOW() WHERE birthday_room_id=$1 AND revoked_at IS NULL',[id]);
  return {status:200,ok:true,closed:true};
 });
 if(result.ok)req.app.get('io')?.to('birthday:'+req.params.id).emit('birthday:closed',{roomId:req.params.id});
 res.status(result.status).json(result);
}));
router.use((err,req,res,next)=>{console.error('CASPIAN birthday API error:',err.message);if(!res.headersSent)res.status(500).json({error:'خطای داخلی اتاق تولد'});});
module.exports=router;
