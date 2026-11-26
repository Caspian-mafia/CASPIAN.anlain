'use strict';
(() => {
  const socket = window.caspianSocket || io();
  let playerId = localStorage.getItem('caspianPlayerId') || '';
  let playerToken = localStorage.getItem('caspianPlayerToken') || '';
  let roomCode = localStorage.getItem('caspianRoom') || '';
  let hostKey = localStorage.getItem('caspianHost') || '';
  if (!playerId && hostKey) playerId = '__host__';
  let isHost = !!hostKey, localStream = null, peers = new Map(), mode = 'hybrid', micOn = false, micAllowed = true, connected = false;
  let controls;
  const $ = id => document.getElementById(id);
  const setStatus = value => { const el = $('voiceStatus'); if (el) el.textContent = value; };
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  function makeControls() {
    const lobby = $('lobby');
    if (!lobby || $('caspianVoicePanel')) return;
    controls = document.createElement('section');
    controls.id = 'caspianVoicePanel';
    controls.className = 'panel caspian-voice-panel';
    controls.innerHTML = '<h3>🎙️ صدای زنده کاسپین</h3><p id="voiceStatus" role="status">در انتظار اتصال به اتاق…</p><div class="voice-row"><button id="voiceMic" type="button">فعال‌کردن میکروفون</button><label>شیوه روایت <select id="voiceMode"><option value="narrator">راوی هوشمند</option><option value="host">گرداننده</option><option value="hybrid">ترکیبی</option></select></label></div><div class="voice-row"><input id="voiceLine" maxlength="240" placeholder="متن اعلان راوی…"><button id="voiceAnnounce" type="button">پخش اعلان</button></div><small>صدای زنده با WebRTC؛ در شب فقط اعضای مجاز جناح مافیا به کانال خصوصی شب متصل می‌شوند.</small><div id="voiceRemoteAudio"></div>';
    lobby.insertBefore(controls, lobby.querySelector('#chatArea') || lobby.lastChild);
    $('voiceMic').onclick = toggleMic;
    $('voiceMode').onchange = () => socket.emit('voice:set-mode', { mode: $('voiceMode').value }, r => { if (!r?.ok) setStatus(r?.error || 'تغییر حالت ناموفق بود'); });
    $('voiceAnnounce').onclick = () => {
      const text = $('voiceLine').value.trim();
      if (text) socket.emit('voice:announce', { text }, r => { if (r?.ok) $('voiceLine').value = ''; else setStatus(r?.error || 'اعلان ارسال نشد'); });
    };
    if (!isHost) {
      $('voiceMode').disabled = true;
      $('voiceAnnounce').disabled = true;
      $('voiceLine').disabled = true;
    }
    $('voiceMode').value = mode;
  }

  async function getConfig() {
    try { const r = await fetch('/api/voice/config', { cache: 'no-store' }); if (r.ok) Object.assign(config, await r.json()); } catch {}
  }
  function closePeers() {
    for (const item of peers.values()) item.pc.close();
    peers.clear();
    const audio = $('voiceRemoteAudio'); if (audio) audio.replaceChildren();
  }
  async function ensureStream() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    localStream.getAudioTracks().forEach(t => { t.enabled = micOn; });
    return localStream;
  }
  function createPeer(remoteId, shouldOffer) {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const pc = new RTCPeerConnection({ iceServers: config.iceServers || config.iceServers });
    const entry = { pc, audio: null };
    peers.set(remoteId, entry);
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (localStream) audioTransceiver.sender.replaceTrack(localStream.getAudioTracks()[0] || null).catch(() => {});
    pc.onicecandidate = event => { if (event.candidate) socket.emit('voice:signal', { targetPlayerId: remoteId, signal: { type: 'candidate', candidate: event.candidate } }); };
    pc.ontrack = event => {
      const audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.srcObject = event.streams[0];
      audio.dataset.peer = remoteId; $('voiceRemoteAudio')?.append(audio); entry.audio = audio;
      audio.play().catch(() => setStatus('برای شنیدن صدای بازیکنان، یک‌بار صفحه را لمس کنید.'));
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus('اتصال صوتی ناپایدار است؛ بررسی TURN لازم است.'); };
    if (shouldOffer) pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => socket.emit('voice:signal', { targetPlayerId: remoteId, signal: { type: 'offer', sdp: pc.localDescription } })).catch(() => {});
    return entry;
  }
  async function connectVoice() {
    if (!connected) return;
    closePeers();
    await getConfig();
    socket.emit('voice:join', {}, result => {
      if (!result?.ok) { setStatus(result?.error || 'دسترسی صوتی فعال نیست.'); return; }
      mode = result.mode || mode;
      if ($('voiceMode')) $('voiceMode').value = mode;
    });
  }
  socket.on('voice:peers', async ({ peers: list = [], audience, mode: nextMode }) => {
    mode = nextMode || mode; if ($('voiceMode')) $('voiceMode').value = mode;
    setStatus(audience === 'mafia' ? 'کانال خصوصی صوتی مافیا فعال است.' : 'به صدای زنده اتاق متصل شدید.');
    if (localStream) {
      for (const track of localStream.getTracks()) track.enabled = micOn;
    }
    for (const peer of list) {
      createPeer(peer.playerId, playerId < peer.playerId);
    }
  });
  socket.on('voice:peer-joined', ({ playerId: id }) => { if (playerId < id) createPeer(id, true); else createPeer(id, false); });
  socket.on('voice:peer-left', ({ playerId: id }) => { const p = peers.get(id); if (p) p.pc.close(); peers.delete(id); document.querySelectorAll('[data-peer="' + id + '"]').forEach(x => x.remove()); });
  socket.on('voice:signal', async ({ fromPlayerId, signal }) => {
    try {
      const entry = createPeer(fromPlayerId, false), pc = entry.pc;
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.emit('voice:signal', { targetPlayerId: fromPlayerId, signal: { type: 'answer', sdp: pc.localDescription } });
      } else if (signal.type === 'answer') await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      else if (signal.type === 'candidate' && signal.candidate) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch { setStatus('برقراری ارتباط صوتی با یکی از بازیکنان ناموفق بود.'); }
  });
  socket.on('voice:mic-permission', ({allowed}={}) => { micAllowed=!!allowed;if(localStream)localStream.getAudioTracks().forEach(t=>t.enabled=micOn&&micAllowed);if(!micAllowed)setStatus('میکروفون شما تا رسیدن نوبت صحبت خاموش است.'); });
  socket.on('voice:blocked', r => { closePeers(); setStatus(r.reason || 'دسترسی صوتی مسدود است.'); });
  socket.on('voice:policy-refresh', () => { closePeers(); socket.emit('voice:policy-refresh-ack'); });
  socket.on('voice:mode', ({ mode: next }) => { mode = next; if ($('voiceMode')) $('voiceMode').value = mode; });
  socket.on('voice:narrator-line', ({ text }) => {
    if (!('speechSynthesis' in window)) return setStatus('گفتار خودکار در این مرورگر پشتیبانی نمی‌شود.');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text || '').slice(0, 240));
    utterance.lang = 'fa-IR'; utterance.rate = 0.94; utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  });

  async function toggleMic() {
    try {
      if (!micOn) {
        const permission=await new Promise(resolve=>socket.emit('voice:mic-request',{},resolve));if(!permission?.allowed){setStatus(permission?.error||'هنوز نوبت صحبت شما نیست.');return;}micAllowed=true;
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('مرورگر یا اتصال HTTPS از میکروفون پشتیبانی نمی‌کند.');
        await ensureStream(); micOn = true;
        localStream.getAudioTracks().forEach(t => { t.enabled = micAllowed; });
        for (const entry of peers.values()) { const sender = entry.pc.getSenders().find(s => s.track?.kind === 'audio' || !s.track); if (sender) await sender.replaceTrack(localStream.getAudioTracks()[0]); }
        $('voiceMic').textContent = 'قطع میکروفون'; setStatus(micAllowed?'میکروفون روشن است؛ صدای شما برای اعضای مجاز ارسال می‌شود.':'نوبت صحبت شما تمام شده است.');
      } else {
        micOn = false; localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
        $('voiceMic').textContent = 'فعال‌کردن میکروفون'; setStatus('میکروفون قطع شد.');
      }
    } catch (e) { setStatus(e.message || 'دسترسی به میکروفون ناموفق بود.'); }
  }

  function activateFromExistingSession() {
    roomCode = localStorage.getItem('caspianRoom') || roomCode;
    playerId = localStorage.getItem('caspianPlayerId') || playerId;
    playerToken = localStorage.getItem('caspianPlayerToken') || playerToken;
    hostKey = localStorage.getItem('caspianHost') || hostKey;
    isHost = !!hostKey;
    if (!roomCode || !playerId || !socket.connected) return;
    makeControls();
    if (connected) return;
    connected = true;
    if (!isHost) { $('voiceMode').disabled = true; $('voiceAnnounce').disabled = true; $('voiceLine').disabled = true; }
    connectVoice();
  }
  socket.on('connect', () => { connected = false; });
  socket.on('disconnect', () => { connected = false; closePeers(); });
  socket.on('room', activateFromExistingSession);
  socket.on('connect_error', () => setStatus('اتصال بخش صدا برقرار نشد.'));
  const observer = new MutationObserver(() => {
    const lobby = $('lobby');
    if (lobby && !lobby.classList.contains('hidden')) { makeControls(); if (!connected && socket.connected) activateFromExistingSession(); }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})();
