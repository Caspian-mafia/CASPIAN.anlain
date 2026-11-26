'use strict';
const crypto = require('crypto');

// Socket.IO signaling for browser-to-browser WebRTC voice. Media is never sent through this server.
function registerVoice(io, app, rooms, roomFor, hostRoom, rules) {
  function publicIceServers() {
    let configured = [];
    try { configured = JSON.parse(process.env.CASPIAN_ICE_SERVERS || '[]'); } catch {}
    const stun = (Array.isArray(configured) ? configured : []).filter(server => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.length && urls.every(url => typeof url === 'string' && /^stuns?:/i.test(url));
    }).map(server => ({ urls: server.urls }));
    if (!stun.length) stun.push({ urls: 'stun:stun.l.google.com:19302' });
    const secret = String(process.env.CASPIAN_TURN_SECRET || '');
    const turnUrls = String(process.env.CASPIAN_TURN_URLS || '').split(',').map(v => v.trim()).filter(v => /^turns?:/i.test(v));
    if (secret.length >= 32 && turnUrls.length) {
      const username = String(Math.floor(Date.now() / 1000) + 3600) + ':caspian';
      const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
      stun.push({ urls: turnUrls, username, credential });
    }
    return stun;
  }

  app.get('/api/voice/config', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ transport: 'webrtc-peer-mesh', iceServers: publicIceServers() });
  });

  function audienceFor(room, player) {
    if (!room || !player || room.finished) return null;
    const stage = room.gameStage || '';
    const isHost = !!player.isHost || player.id === room.hostPlayerId;
    if (['mafiaTalk','mafiaAction'].includes(stage) || (!stage && room.phase === 'شب')) {
      return isHost || (player.role && rules.roleGroup(player.role, room.scenario.id) === 'mafia') ? 'mafia' : null;
    }
    if (stage === 'citizenAbilities') {
      return isHost || player.id === room.turnPlayerId ? 'citizen-host:' + room.turnPlayerId : null;
    }
    if (['intro','day1','discussion','vote','defense','lobby','cardSelection'].includes(stage) || room.phase === 'روز') return 'all';
    return null;
  }
  function canSpeak(room, player) {
    if (!room || !player) return false;
    const host = player.id === room.hostPlayerId;
    if (['mafiaTalk','mafiaAction'].includes(room.gameStage || '')) return host || rules.roleGroup(player.role, room.scenario.id) === 'mafia';
    if (room.gameStage === 'citizenAbilities') return host || player.id === room.turnPlayerId;
    if (['intro','day1','discussion','vote','defense'].includes(room.gameStage || '') && room.speakerTurnId) return host || player.id === room.speakerTurnId;
    return true;
  }
  function voiceRoom(code, audience) { return 'caspian-voice:' + code + ':' + audience; }
  function participant(socket) {
    const room = roomFor(socket) || hostRoom(socket);
    const player = room?.players.find(p => p.id === socket.data.playerId && p.socketId === socket.id) || (room?.hostMode === 'moderator' && room.hostSocketId === socket.id ? { id:'__host__',name:'گرداننده',role:null,socketId:socket.id,isHost:true } : null);
    return room && player ? { room, player } : null;
  }
  function rejoin(socket) {
    const found = participant(socket);
    const old = socket.data.voiceChannel;
    if (old) socket.leave(old);
    socket.data.voiceChannel = null;
    if (!found) return;
    const audience = audienceFor(found.room, found.player);
    if (!audience) {
      socket.emit('voice:blocked', { reason: 'در این مرحله دسترسی صوتی برای نقش شما فعال نیست.' });
      return;
    }
    const channel = voiceRoom(found.room.code, audience);
    const peers = found.room.players
      .filter(p => p.id !== found.player.id && p.socketId && audienceFor(found.room, p) === audience)
      .map(p => ({ playerId: p.id, name: p.name }));
    if(found.room.hostMode==='moderator'&&found.room.hostSocketId&&found.room.hostSocketId!==socket.id)peers.push({playerId:'__host__',name:'گرداننده'});
    socket.join(channel);
    socket.data.voiceChannel = channel;
    socket.data.voiceRoomCode = found.room.code;
    socket.data.voiceAudience = audience;
    socket.emit('voice:peers', { peers, audience, mode: found.room.narratorMode || 'hybrid' });socket.emit('voice:mic-permission',{allowed:canSpeak(found.room,found.player)});
    socket.to(channel).emit('voice:peer-joined', { playerId: found.player.id, name: found.player.name });
  }

  io.on('connection', socket => {
    socket.on('voice:mic-request', (_data = {}, cb) => { const found=participant(socket);const allowed=!!found&&canSpeak(found.room,found.player);cb?.({ok:allowed,allowed,error:allowed?'':'میکروفون در نوبت بازیکن دیگری غیرفعال است.'}); });
    socket.on('voice:join', (_data = {}, cb) => {
      const found = participant(socket);
      if (!found) return cb?.({ ok: false, error: 'ابتدا باید وارد اتاق شوید.' });
      rejoin(socket);
      cb?.({ ok: !!socket.data.voiceChannel, audience: socket.data.voiceAudience || null });
    });
    socket.on('voice:signal', ({ targetPlayerId, signal } = {}, cb) => {
      const found = participant(socket);
      const channel = socket.data.voiceChannel;
      const target = found?.room.players.find(p => p.id === targetPlayerId && p.socketId) || (found?.room.hostMode==='moderator'&&targetPlayerId==='__host__'&&found.room.hostSocketId?{id:'__host__',name:'گرداننده',role:null,socketId:found.room.hostSocketId,isHost:true}:null);
      if (!found || !channel || !target || audienceFor(found.room, found.player) !== socket.data.voiceAudience ||
          audienceFor(found.room, target) !== socket.data.voiceAudience) {
        return cb?.({ ok: false, error: 'مسیر ارتباط صوتی مجاز نیست.' });
      }
      if (!signal || !['offer', 'answer', 'candidate'].includes(signal.type) ||
          JSON.stringify(signal).length > 12000) return cb?.({ ok: false, error: 'پیام اتصال صوتی نامعتبر است.' });
      io.to(target.socketId).emit('voice:signal', { fromPlayerId: found.player.id, signal });
      cb?.({ ok: true });
    });
    socket.on('voice:set-mode', ({ mode } = {}, cb) => {
      const room = hostRoom(socket);
      if (!room) return cb?.({ ok: false, error: 'فقط گرداننده می‌تواند شیوه روایت را تغییر دهد.' });
      if (!['narrator', 'host', 'hybrid'].includes(mode)) return cb?.({ ok: false, error: 'شیوه روایت نامعتبر است.' });
      room.narratorMode = mode;
      io.to(room.code).emit('voice:mode', { mode });
      io.to(room.code).emit('voice:policy-refresh');
      cb?.({ ok: true, mode });
    });
    socket.on('voice:announce', ({ text } = {}, cb) => {
      const room = hostRoom(socket);
      const line = String(text || '').trim().slice(0, 240);
      if (!room || !line) return cb?.({ ok: false, error: 'فقط گرداننده می‌تواند اعلان راوی را ارسال کند.' });
      if (!['narrator', 'hybrid'].includes(room.narratorMode || 'hybrid')) {
        return cb?.({ ok: false, error: 'راوی خودکار در این اتاق خاموش است.' });
      }
      io.to(room.code).emit('voice:narrator-line', { text: line });
      cb?.({ ok: true });
    });
    socket.on('voice:policy-refresh-ack', () => rejoin(socket));
    socket.on('disconnect', () => {
      if (socket.data.voiceChannel) socket.to(socket.data.voiceChannel).emit('voice:peer-left', { playerId: socket.data.playerId });
    });
  });

  return { rejoin };
}
module.exports = registerVoice;
