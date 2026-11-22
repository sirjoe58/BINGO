'use strict';
/* =====================================================================
   BINGO / TOMBOLA  -  Windows, Mac (Electron) e Android (Capacitor)
   ===================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const MAX_PLAYERS = 2000, MAX_CARDS = 6, MAX_CARD_NO = MAX_PLAYERS * MAX_CARDS;
const PRIZES = [
  { key: 'ambo',      label: 'AMBO',      need: 2 },
  { key: 'terno',     label: 'TERNO',     need: 3 },
  { key: 'quaterna',  label: 'QUATERNA',  need: 4 },
  { key: 'cinquina',  label: 'CINQUINA',  need: 5 },
  { key: 'tombola',   label: 'TOMBOLA',   need: 15 },
  { key: 'tombolone', label: 'TOMBOLONE', need: 15 },
];
const CAP = window.Capacitor;
const IS_NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const plugin = name => (IS_NATIVE && CAP.Plugins && CAP.Plugins[name]) || null;
const GENERIC_NAME = /^Giocatore \d+$/;

/* ------------------------- memoria locale ------------------------- */
const store = {
  get(k, def) { try { const v = localStorage.getItem('bingo.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('bingo.' + k, JSON.stringify(v)); } catch (e) { /* pieno o non disponibile */ } },
};

const settings = Object.assign({
  theme: 'cartoon', voice: 'female', voiceName: '', speed: 3, voiceOn: true,
  numPlayers: 10, cardsPerPlayer: 1,
  prizes: { ambo: true, terno: true, quaterna: true, cinquina: true, tombola: true, tombolone: true },
  price: 1, fee: 0, fixedPot: '', roundEuro: false,
}, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

let roster = [];                                   // [{name, cards:[n,...]}]
let known = (() => { const k = store.get('players', []); return Array.isArray(k) ? k : Object.keys(k || {}); })();   // solo i nomi
const START_DELAY = 5;   // secondi di attesa dopo AVVIA / RIPRENDI

/* ===================== GENERAZIONE CARTELLE =====================
   Ogni numero di cartella genera SEMPRE gli stessi numeri: cosi' un
   giocatore puo' riscegliere la sua cartella preferita in ogni partita.
   Le cartelle 1-6, 7-12, ... formano "serie" che coprono tutti i 90 numeri. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const colOf = n => (n === 90 ? 8 : Math.floor(n / 10));
const seriesCache = new Map();

function assignRows(cc, rnd) {
  for (let t = 0; t < 100; t++) {
    const cap = [5, 5, 5], out = new Array(9);
    const order = shuffle([...Array(9).keys()], rnd).sort((a, b) => cc[b] - cc[a]);
    let ok = true;
    for (const c of order) {
      const rs = shuffle([0, 1, 2].filter(r => cap[r] > 0), rnd).sort((a, b) => cap[b] - cap[a]);
      if (rs.length < cc[c]) { ok = false; break; }
      out[c] = rs.slice(0, cc[c]); out[c].forEach(r => cap[r]--);
    }
    if (ok) return out;
  }
  return null;
}
function tryGenSeries(rnd) {
  const cols = Array.from({ length: 9 }, () => []);
  for (let n = 1; n <= 90; n++) cols[colOf(n)].push(n);
  cols.forEach(c => shuffle(c, rnd));
  const cnt = Array.from({ length: 6 }, () => new Array(9).fill(1));
  const tot = new Array(6).fill(9);
  const tokens = [];
  cols.forEach((c, i) => { for (let k = 0; k < c.length - 6; k++) tokens.push(i); });
  shuffle(tokens, rnd);
  for (const c of tokens) {
    const cand = []; for (let k = 0; k < 6; k++) if (tot[k] < 15 && cnt[k][c] < 3) cand.push(k);
    if (!cand.length) return null;
    const min = Math.min(...cand.map(k => tot[k]));
    const best = cand.filter(k => tot[k] === min);
    const k = best[Math.floor(rnd() * best.length)]; cnt[k][c]++; tot[k]++;
  }
  const ptr = new Array(9).fill(0), cards = [];
  for (let k = 0; k < 6; k++) {
    const rows = assignRows(cnt[k], rnd); if (!rows) return null;
    const grid = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0)];
    for (let c = 0; c < 9; c++) {
      const nums = cols[c].slice(ptr[c], ptr[c] + cnt[k][c]).sort((a, b) => a - b); ptr[c] += cnt[k][c];
      rows[c].slice().sort((a, b) => a - b).forEach((r, i) => { grid[r][c] = nums[i]; });
    }
    cards.push(grid);
  }
  return cards;
}
function getSeries(s) {
  if (seriesCache.has(s)) return seriesCache.get(s);
  const rnd = mulberry32((s + 1) * 7919 + 104729);
  let res = null; while (!res) res = tryGenSeries(rnd);
  seriesCache.set(s, res); return res;
}
const getCard = no => getSeries(Math.floor((no - 1) / 6))[(no - 1) % 6];

/* ============================ VOCE ============================ */
const FEMALE_RX = /female|donna|elsa|alice|federica|paola|isabella|carla|giulia|francesca|chiara|bianca|sara|silvia|elena|kda|-ita-|itb/i;
const MALE_RX = /\bmale\b|uomo|cosimo|luca|diego|giorgio|giuseppe|benigno|riccardo|marco|paolo|calimero|itc|itd/i;
const genderOf = name => (FEMALE_RX.test(name) ? 'female' : MALE_RX.test(name) ? 'male' : '');

const TTS = {
  voices: [],            // {id, name, lang, gender}
  async init() {
    if (IS_NATIVE && plugin('TextToSpeech')) {
      try {
        const r = await plugin('TextToSpeech').getSupportedVoices();
        this.voices = (r.voices || []).map((v, i) => ({ id: i, name: v.name || v.voiceURI || ('Voce ' + i), lang: (v.lang || '').replace('_', '-') }))
          .filter(v => /^it/i.test(v.lang));
      } catch (e) { this.voices = []; }
    } else if ('speechSynthesis' in window) {
      const load = () => {
        this.voices = speechSynthesis.getVoices().map((v, i) => ({ id: i, name: v.name, lang: v.lang, ref: v }))
          .filter(v => /^it/i.test(v.lang));
        this.fillSelect();
      };
      load(); speechSynthesis.onvoiceschanged = load;
    }
    this.voices.forEach(v => { v.gender = genderOf(v.name); });
    this.fillSelect();
  },
  fillSelect() {
    this.voices.forEach(v => { v.gender = genderOf(v.name); });
    const sel = $('#voiceSelect');
    sel.innerHTML = '<option value="">Automatica</option>' + this.voices.map(v =>
      `<option value="${esc(v.name)}">${esc(v.name)}${v.gender ? (v.gender === 'male' ? ' (maschile)' : ' (femminile)') : ''}</option>`).join('');
    sel.value = settings.voiceName || '';
    const note = $('#voiceNote');
    if (!this.voices.length) {
      note.textContent = IS_NATIVE
        ? 'Nessuna voce italiana trovata: installa "Sintesi vocale Google" e la lingua italiana nelle impostazioni del telefono.'
        : 'Nessuna voce italiana trovata sul computer. Windows: Impostazioni > Ora e lingua > Voce > Aggiungi voci (Italiano). Mac: Impostazioni > Accessibilità > Contenuti letti ad alta voce > Voce di sistema.';
    } else {
      const g = settings.voice;
      note.textContent = this.voices.some(v => v.gender === g) ? ''
        : `Sul dispositivo non c'è una voce italiana ${g === 'male' ? 'maschile' : 'femminile'}: viene usata un'altra voce italiana con il tono modificato.`;
    }
  },
  pick() {
    let v = settings.voiceName && this.voices.find(x => x.name === settings.voiceName);
    if (v) return { v, pitch: 1 };
    v = this.voices.find(x => x.gender === settings.voice);
    if (v) return { v, pitch: 1 };
    v = this.voices[0] || null;
    return { v, pitch: settings.voice === 'male' ? 0.6 : 1.35 };
  },
  rate() { return settings.speed <= 1 ? 1.45 : settings.speed === 2 ? 1.2 : 1.0; },
  silent(text) { return new Promise(res => setTimeout(res, Math.min(2500, 600 + text.length * 40))); },
  speak(text, extra = 1) {
    if (!settings.voiceOn) return this.silent(text);
    const { v, pitch } = this.pick();
    const rate = this.rate() * extra;
    const timeout = new Promise(res => setTimeout(res, 2500 + text.length * 140));
    let p;
    if (IS_NATIVE && plugin('TextToSpeech')) {
      const opt = { text, lang: 'it-IT', rate, pitch, volume: 1.0, category: 'playback' };
      if (v) opt.voice = v.id;
      p = plugin('TextToSpeech').speak(opt).catch(() => {});
    } else if ('speechSynthesis' in window) {
      p = new Promise(res => {
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'it-IT'; u.rate = rate; u.pitch = pitch;
          if (v && v.ref) u.voice = v.ref;
          u.onend = res; u.onerror = res;
          speechSynthesis.speak(u);
        } catch (e) { res(); }
      });
    } else p = Promise.resolve();
    return Promise.race([p, timeout]);
  },
  stop() {
    try { if (IS_NATIVE && plugin('TextToSpeech')) plugin('TextToSpeech').stop(); else if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  },
};

/* ======================== MUSICA E SUONI ======================== */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function tone(ac, out, t, midi, dur, type = 'square', vol = 0.18) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(ac, out, t, dur, vol = 0.25) {
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1500; g.gain.value = vol;
  s.buffer = buf; s.connect(f); f.connect(g); g.connect(out); s.start(t);
}
function chime() {                           // vincita normale
  const ac = audio(); if (!ac) return;
  const out = ac.createGain(); out.gain.value = 0.7; out.connect(ac.destination);
  const t = ac.currentTime + 0.03;
  [72, 76, 79, 84].forEach((m, i) => tone(ac, out, t + i * 0.09, m, 0.5, 'triangle', 0.25));
}
function festiveMusic() {                    // musica festosa originale per tombola/tombolone (~12 s)
  const ac = audio(); if (!ac) return;
  const out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.connect(out);
  const b = 60 / 152; let t = ac.currentTime + 0.05;
  for (let i = 0; i < 12; i++) noise(ac, out, t + i * 0.06, 0.06, 0.12 + i * 0.01);   // rullo di tamburo
  t += 0.8;
  const mel = [
    [67,.5],[72,.5],[76,.5],[79,1],[76,.5],[79,1.5],[0,.5],
    [69,.5],[72,.5],[77,.5],[81,1],[77,.5],[81,1.5],[0,.5],
    [79,.5],[81,.5],[79,.5],[77,.5],[76,.5],[74,.5],[72,.5],[74,.5],
    [76,.5],[77,.5],[79,.5],[81,.5],[83,1],[84,2],
  ];
  const chords = [[48, 55, 64], [48, 55, 64], [53, 57, 65], [53, 57, 65], [55, 59, 67], [55, 59, 65], [48, 52, 60], [48, 55, 64]];
  for (let rep = 0; rep < 2; rep++) {
    let tt = t;
    mel.forEach(([m, d]) => { if (m) { tone(ac, lp, tt, m, d * b * 0.95, 'sawtooth', 0.11); tone(ac, lp, tt, m + 12, d * b * 0.9, 'square', 0.04); } tt += d * b; });
    const total = tt - t;
    chords.forEach((ch, i) => {
      const ct = t + i * (total / chords.length);
      ch.forEach(m => tone(ac, lp, ct, m, total / chords.length * 0.95, 'triangle', 0.07));
      for (let k = 0; k < 4; k++) {
        const bt = ct + k * (total / chords.length / 4);
        tone(ac, out, bt, ch[0] - 12, 0.18, 'sine', 0.3);          // basso / grancassa
        if (k % 2) noise(ac, out, bt, 0.12, 0.22);                // rullante
      }
    });
    t = tt + 0.1;
  }
  for (let i = 0; i < 3; i++) tone(ac, lp, t + i * 0.12, [72, 76, 84][i], 1.5, 'sawtooth', 0.1);
}

/* ======================== CORIANDOLI ======================== */
let confettiRun = 0;
function confetti(seconds = 8) {
  const cv = $('#confetti'), box = $('#winBox'); if (!cv || box.hidden) return;
  const ctx = cv.getContext('2d'), id = ++confettiRun;
  const W = cv.width = box.clientWidth, H = cv.height = box.clientHeight;
  const cols = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];
  const ps = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: -Math.random() * H, vy: 1 + Math.random() * 2.5, vx: -1 + Math.random() * 2, r: Math.random() * 6, s: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  const end = performance.now() + seconds * 1000;
  (function frame() {
    if (id !== confettiRun) return;
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.r += 0.1; if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = 0.55; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    });
    if (performance.now() < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })();
}

/* ========================= UTILITA' ========================= */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const euro = v => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function parseNums(text) {
  const out = []; const bad = [];
  String(text || '').split(/[,;\s]+/).filter(Boolean).forEach(tok => {
    const m = tok.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) { bad.push(tok); return; }
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    if (b - a > 200) { bad.push(tok); return; }
    for (let i = a; i <= b; i++) out.push(i);
  });
  return { nums: [...new Set(out)], bad };
}
function msg(el, text, kind = '') { el.textContent = text; el.className = 'msg ' + kind; }
const totalCards = () => roster.reduce((s, p) => s + p.cards.length, 0);
function usedSet(exceptIdx = -1) { const s = new Set(); roster.forEach((p, i) => { if (i !== exceptIdx) p.cards.forEach(c => s.add(c)); }); return s; }
function reservedSet() {             // cartelle preferite di giocatori conosciuti non presenti
  const present = new Set(roster.map(p => p.name.toLowerCase())), r = new Set();
  return r;
}
function freeNumbers(count, used) {
  const res = [], reserved = reservedSet();
  for (let pass = 0; pass < 2 && res.length < count; pass++) {
    for (let n = 1; n <= MAX_CARD_NO && res.length < count; n++) {
      if (used.has(n) || res.includes(n)) continue;
      if (pass === 0 && reserved.has(n)) continue;
      res.push(n);
    }
  }
  return res;
}
function nextGenericName() {
  let k = 1; const used = new Set(roster.map(p => p.name));
  while (used.has('Giocatore ' + k)) k++;
  return 'Giocatore ' + k;
}

/* ===================== ELENCO GIOCATORI ===================== */
function addPlayer(name, cardsText, count, silent = false) {
  name = (name || '').trim().replace(/\s+/g, ' ');
  if (!name) name = nextGenericName();
  if (roster.length >= MAX_PLAYERS) return 'Massimo 2000 giocatori.';
  if (roster.some(p => p.name.toLowerCase() === name.toLowerCase())) return `"${name}" è già in elenco.`;
  const used = usedSet();
  let cards;
  if (cardsText && cardsText.trim()) {
    const { nums, bad } = parseNums(cardsText);
    if (bad.length) return 'Numeri non validi: ' + bad.join(' ');
    if (!nums.length) return 'Nessun numero di cartella.';
    if (nums.length > MAX_CARDS) return 'Massimo 6 cartelle per giocatore.';
    const out = nums.filter(n => n < 1 || n > MAX_CARD_NO);
    if (out.length) return `Le cartelle vanno da 1 a ${MAX_CARD_NO}.`;
    const taken = nums.filter(n => used.has(n));
    if (taken.length) return 'Cartella già assegnata: ' + taken.map(n => `${n} (${roster.find(p => p.cards.includes(n)).name})`).join(', ');
    cards = nums;
  } else {
    cards = freeNumbers(Math.min(MAX_CARDS, Math.max(1, count || settings.cardsPerPlayer)), used);
  }
  roster.push({ name, cards });
  if (!silent) renderRoster();
  return '';
}
function renderRoster() {
  const f = ($('#rosterFilter').value || '').trim().toLowerCase();
  const rows = [];
  roster.forEach((p, i) => {
    if (f && !p.name.toLowerCase().includes(f) && !p.cards.some(c => String(c) === f)) return;
    rows.push(`<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${p.cards.map(c => `<span class="cardchip">${c}</span>`).join('')}</td>
      <td class="act"><button data-act="edit" data-i="${i}" title="Modifica">✏️</button><button data-act="print" data-i="${i}" title="Stampa">🖨️</button><button data-act="del" data-i="${i}" title="Togli">✖</button></td></tr>`);
  });
  $('#roster tbody').innerHTML = rows.join('') || '<tr><td colspan="4" class="note">Nessun giocatore. Usa l\'inserimento veloce qui sopra.</td></tr>';
  $('#rosterCount').textContent = `${roster.length} giocator${roster.length === 1 ? 'e' : 'i'} - ${totalCards()} cartell${totalCards() === 1 ? 'a' : 'e'}`;
  const pw = $('#printWho');
  pw.innerHTML = '<option value="all">Tutte le cartelle dei giocatori</option>' + roster.map((p, i) => `<option value="${i}">${esc(p.name)} (${p.cards.join(', ')})</option>`).join('');
  renderPrizeTable();
}
function refreshKnownNames() {
  $('#knownNames').innerHTML = known.slice().sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">`).join('');
}

/* ========================= PREMI ========================= */
const enabledPrizes = () => PRIZES.filter(p => settings.prizes[p.key]);
function computePot() {
  const fixed = parseFloat(settings.fixedPot);
  if (!isNaN(fixed) && fixed > 0) return fixed;
  return Math.max(0, totalCards() * (+settings.price || 0) * (1 - Math.min(100, +settings.fee || 0) / 100));
}
function computePrizeAmounts() {
  const en = enabledPrizes(), pot = computePot();
  const k = en.length, wsum = k * (k + 1) / 2, unit = settings.roundEuro ? 1 : 0.01;
  const amounts = {}; let given = 0;
  en.forEach((p, i) => {
    if (i < k - 1) { const a = Math.floor((pot * (i + 1) / wsum) / unit + 1e-9) * unit; amounts[p.key] = +a.toFixed(2); given += amounts[p.key]; }
    else amounts[p.key] = settings.roundEuro ? Math.floor(pot - given + 1e-9) : +(pot - given).toFixed(2);
  });
  return { pot, amounts };
}
function renderPrizeChecks() {
  $('#prizeChecks').innerHTML = PRIZES.map(p => `<label><input type="checkbox" data-prize="${p.key}" ${settings.prizes[p.key] ? 'checked' : ''}> ${p.label}</label>`).join('');
}
function renderPrizeTable() {
  const { pot, amounts } = computePrizeAmounts();
  const en = enabledPrizes();
  $('#prizeTable').innerHTML = `<tr><th>Premio</th><th class="amt">Importo</th></tr>` +
    en.map(p => `<tr><td>${p.label}</td><td class="amt">${euro(amounts[p.key])}</td></tr>`).join('') +
    `<tr class="tot"><td><b>Montepremi totale</b> (${totalCards()} cartelle)</td><td class="amt">${euro(pot)}</td></tr>`;
}

/* ========================= STAMPA ========================= */
function cardsToPrint() {
  const t = $('#printNums').value.trim();
  if (t) {
    const { nums, bad } = parseNums(t);
    if (bad.length) throw new Error('Numeri non validi: ' + bad.join(' '));
    return nums.filter(n => n >= 1 && n <= MAX_CARD_NO).map(n => {
      const p = roster.find(pl => pl.cards.includes(n)); return { no: n, name: p ? p.name : '' };
    });
  }
  const who = $('#printWho').value;
  const list = who === 'all' ? roster : [roster[+who]].filter(Boolean);
  const out = []; list.forEach(p => p.cards.forEach(no => out.push({ no, name: p.name })));
  return out;
}
function doPrint(list) {
  if (!list.length) throw new Error('Nessuna cartella da stampare.');
  if (IS_NATIVE) return doPdf(list);             // su Android si stampa/condivide il PDF
  $('#print-area').innerHTML = list.map(({ no, name }) => {
    const g = getCard(no);
    return `<div class="pcard"><div class="ph"><span>${esc(name)}</span><span>Cartella N. ${no}</span></div><table>${g.map(r => '<tr>' + r.map(v => v ? `<td>${v}</td>` : '<td class="e"></td>').join('') + '</tr>').join('')}</table></div>`;
  }).join('');
  setTimeout(() => window.print(), 50);
}
async function doPdf(list) {
  if (!list.length) throw new Error('Nessuna cartella da stampare.');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  // 6 cartelle per foglio A4, una sotto l'altra, a tutta pagina
  const mx = 8, top = 8, W = 210 - 2 * mx, blockH = (297 - 2 * top) / 6, headH = 7, gap = 3;
  const cw = W / 9, ch = (blockH - headH - gap) / 3, H = ch * 3, perPage = 6;
  list.forEach(({ no, name }, i) => {
    if (i && i % perPage === 0) pdf.addPage();
    const x = mx, y = top + (i % perPage) * blockH;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(0);
    pdf.text(String(name || '').slice(0, 45), x, y + 5);
    pdf.text('Cartella N. ' + no, x + W, y + 5, { align: 'right' });
    const g = getCard(no), y0 = y + headH;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      const v = g[r][c], cx = x + c * cw, cy = y0 + r * ch;
      if (!v) { pdf.setFillColor(215, 215, 215); pdf.rect(cx, cy, cw, ch, 'F'); }
      pdf.setLineWidth(0.4); pdf.setDrawColor(0); pdf.rect(cx, cy, cw, ch);
      if (v) { pdf.setFontSize(28); pdf.text(String(v), cx + cw / 2, cy + ch / 2 + 3.6, { align: 'center' }); }
    }
    pdf.setLineWidth(0.9); pdf.rect(x, y0, W, H);
  });
  const fname = 'Cartelle_Bingo_' + new Date().toISOString().slice(0, 10) + '.pdf';
  if (IS_NATIVE && plugin('Filesystem') && plugin('Share')) {
    const b64 = pdf.output('datauristring').split(',')[1];
    const r = await plugin('Filesystem').writeFile({ path: fname, data: b64, directory: 'CACHE' });
    await plugin('Share').share({ title: 'Cartelle Bingo', text: 'Cartelle Bingo', url: r.uri, dialogTitle: 'Stampa o condividi le cartelle' });
  } else {
    pdf.save(fname);
  }
}

/* ======================= DISEGNO CARTELLA ======================= */
function cardHTML(no, name, marked, winRow = -1) {
  const g = getCard(no);
  return `<div class="tcard"><div class="th"><span>${esc(name || '')}</span><span>N. ${no}</span></div><table>${
    g.map((r, ri) => `<tr class="${ri === winRow ? 'wr' : ''}">` + r.map(v => v ? `<td class="${marked.has(v) ? 'm' : ''}">${v}</td>` : '<td class="e"></td>').join('') + '</tr>').join('')}</table></div>`;
}

/* =========================== PARTITA =========================== */
const G = {
  state: 'idle',      // idle | running | paused | win | over
  loop: 0, timer: null,
  pool: [], drawn: [], drawnSet: new Set(),
  cards: [], index: null, byNo: new Map(),
  enabled: [], prizeIdx: 0, amounts: {}, pot: 0,
  awards: [],         // {prize, number, winners:[{ci,row}], each}
  firstFull: null,
};

function buildBoard() {
  $('#board').innerHTML = Array.from({ length: 90 }, (_, i) => `<div class="cell" id="c${i + 1}">${i + 1}</div>`).join('');
}
function setupGame() {
  G.cards = []; G.byNo = new Map(); G.index = Array.from({ length: 91 }, () => []);
  roster.forEach(p => p.cards.forEach(no => {
    const grid = getCard(no), ci = G.cards.length;
    G.cards.push({ no, name: p.name, grid, rowHits: [0, 0, 0], total: 0, marked: new Set() });
    G.byNo.set(no, ci);
    grid.forEach((r, ri) => r.forEach(v => { if (v) G.index[v].push({ ci, row: ri }); }));
  }));
  const arr = new Uint32Array(90); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(arr) : arr.forEach((_, i) => { arr[i] = Math.random() * 4e9; });
  G.pool = shuffle([...Array(90).keys()].map(i => i + 1), (() => { let k = 0; return () => arr[k++ % 90] / 4294967296; })());
  G.drawn = []; G.drawnSet = new Set();
  G.enabled = enabledPrizes(); G.prizeIdx = 0; G.awards = []; G.firstFull = null;
  const pa = computePrizeAmounts(); G.amounts = pa.amounts; G.pot = pa.pot;
  buildBoard();
  $('#currentNum').textContent = '–'; $('#lastNums').innerHTML = ''; $('#drawnCount').textContent = '0 / 90';
  $('#winBox').hidden = true; $('#game').classList.remove('has-win'); $('#checkOut').innerHTML = ''; $('#checkNo').value = '';
  $('#potTotal').textContent = euro(G.pot);
  setState('idle'); renderPrizeStatus();
}
function setState(s) {
  G.state = s;
  $('#bStart').hidden = s !== 'idle';
  $('#bResume').hidden = s === 'idle';
  $('#bResume').disabled = !(s === 'paused' || s === 'win');
  $('#bPause').disabled = s !== 'running';
  $('#bStop').disabled = !(s === 'running' || s === 'paused' || s === 'win');
  const cur = G.enabled[G.prizeIdx];
  $('#pfLabel').textContent = 'Si gioca per:';
  $('#playingFor').textContent = s === 'over' ? 'PARTITA FINITA' : cur ? cur.label : '–';
}
function renderPrizeStatus() {
  $('#prizeStatus').innerHTML = G.enabled.map((p, i) => {
    const aw = G.awards.find(a => a.prize.key === p.key);
    const cls = aw ? 'done' : (i === G.prizeIdx && G.state !== 'over' ? 'cur' : '');
    const shown = aw ? aw.winners.slice(0, 5) : [];
    const more = aw && aw.winners.length > 5 ? ` <span class="more">e altri ${aw.winners.length - 5}</span>` : '';
    const ws = aw ? `<div class="ws">al n. <b>${aw.number}</b>: ${shown.map(w => `<a data-card="${G.cards[w.ci].no}">${esc(G.cards[w.ci].name)} (cart. ${G.cards[w.ci].no})</a>`).join(', ')}${more}${aw.winners.length > 1 ? ` - ${euro(aw.each)} ciascuno` : ''}</div>` : '';
    return `<div class="pz ${cls}"><div><div class="nm">${aw ? '✅ ' : ''}${p.label}</div>${ws}</div><div class="val">${euro(G.amounts[p.key] || 0)}</div></div>`;
  }).join('');
}
function updateBoard(n) {
  $$('.cell.last').forEach(c => c.classList.remove('last'));
  const c = $('#c' + n); if (c) { c.classList.add('hit', 'last'); }
  const cur = $('#currentNum'); cur.textContent = n; cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop');
  $('#drawnCount').textContent = `${G.drawn.length} / 90`;
  $('#lastNums').innerHTML = G.drawn.slice(-6).reverse().map(x => `<span>${x}</span>`).join('');
}

function checkWins(hits) {
  const found = [];
  const newlyFull = [...new Set(hits.map(h => h.ci))].filter(ci => G.cards[ci].total === 15);
  let firstNow = false;
  if (!G.firstFull && newlyFull.length) { G.firstFull = new Set(newlyFull); firstNow = true; }
  while (G.prizeIdx < G.enabled.length) {
    const p = G.enabled[G.prizeIdx];
    let winners = [];
    if (p.need < 15) winners = hits.filter(h => G.cards[h.ci].rowHits[h.row] >= p.need).map(h => ({ ci: h.ci, row: h.row }));
    else if (p.key === 'tombola') winners = firstNow ? newlyFull.map(ci => ({ ci, row: -1 })) : [];
    else winners = (G.firstFull && !firstNow) ? newlyFull.filter(ci => !G.firstFull.has(ci)).map(ci => ({ ci, row: -1 })) : [];
    if (!winners.length) break;
    const amount = G.amounts[p.key] || 0;
    const each = settings.roundEuro ? Math.floor(amount / winners.length) : Math.floor(amount / winners.length * 100) / 100;
    const aw = { prize: p, number: G.drawn[G.drawn.length - 1], winners, each };
    G.awards.push(aw); found.push(aw); G.prizeIdx++;
  }
  return found;
}

async function step(loopId) {
  if (loopId !== G.loop || G.state !== 'running') return;
  if (!G.pool.length) { finish('Numeri esauriti'); return; }
  const t0 = performance.now();
  const n = G.pool.pop(); G.drawn.push(n); G.drawnSet.add(n);
  const hits = G.index[n];
  hits.forEach(h => { const c = G.cards[h.ci]; c.rowHits[h.row]++; c.total++; c.marked.add(n); });
  updateBoard(n);
  const wins = checkWins(hits);
  if (wins.length) {
    G.loop++; setState('win');
    await showWins(wins);
    return;
  }
  await TTS.speak(String(n));
  if (loopId !== G.loop || G.state !== 'running') return;
  const wait = Math.max(150, settings.speed * 1000 - (performance.now() - t0));
  G.timer = setTimeout(() => step(loopId), wait);
}

async function showWins(wins) {
  const big = wins.some(w => w.prize.key === 'tombola' || w.prize.key === 'tombolone');
  const box = $('#winBox'); box.hidden = false; $('#game').classList.add('has-win');
  $('#winTitle').textContent = '🎉 ' + wins.map(w => w.prize.label).join(' + ') + '! 🎉';
  $('#winList').innerHTML = wins.map(w => w.winners.map(x => {
    const c = G.cards[x.ci];
    return `<div class="winner"><div class="who">${esc(c.name)}</div><div>${w.prize.label} - Cartella N. <b>${c.no}</b> - <span class="amt">${euro(w.each)}</span></div>${cardHTML(c.no, '', c.marked, x.row)}</div>`;
  }).join('')).join('');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  renderPrizeStatus();
  const done = G.prizeIdx >= G.enabled.length;
  if (big) { festiveMusic(); confetti(10); } else chime();
  await TTS.speak(String(G.drawn[G.drawn.length - 1]));
  for (const w of wins) {
    const names = w.winners.map(x => `cartella numero ${G.cards[x.ci].no}, ${G.cards[x.ci].name}`).join('; e ');
    await TTS.speak(`${w.prize.label.toLowerCase()}! ${names}`, 0.9);
  }
  if (done) finish('Tutti i premi sono stati assegnati');
  else setState('win');
}

function finish(reason) {
  G.loop++; clearTimeout(G.timer); clearCountdown();
  setState('over'); renderPrizeStatus();
  $('#bResume').disabled = true;
  $('#playingFor').textContent = 'PARTITA FINITA';
  if (reason && !G.awards.length) TTS.speak('Partita finita');
}
function countdownThenRun() {
  setState('running'); const id = ++G.loop;
  const cur = $('#currentNum'), prev = cur.classList.contains('count') ? G.countPrev : cur.textContent;
  G.countPrev = prev;
  let n = START_DELAY;
  cur.classList.add('count'); $('#pfLabel').textContent = 'Si parte tra'; $('#playingFor').textContent = n + ' secondi';
  const tick = () => {
    if (id !== G.loop || G.state !== 'running') { cur.classList.remove('count'); if (cur.textContent !== prev && /^\d$/.test(cur.textContent)) cur.textContent = prev; return; }
    if (n <= 0) { cur.classList.remove('count'); cur.textContent = prev; setState('running'); step(id); return; }
    cur.textContent = n; $('#pfLabel').textContent = 'Si parte tra'; $('#playingFor').textContent = n + ' secondi';
    n--; G.timer = setTimeout(tick, 1000);
  };
  tick();
}
function clearCountdown() {
  const cur = $('#currentNum');
  if (cur.classList.contains('count')) { cur.classList.remove('count'); cur.textContent = G.countPrev || '–'; }
}
function start() {
  audio(); countdownThenRun();
}
function resume() {
  if (!(G.state === 'paused' || G.state === 'win')) return;
  audio();
  $('#winBox').hidden = true; $('#game').classList.remove('has-win'); confettiRun++;
  countdownThenRun();
}
function pause() {
  if (G.state !== 'running') return;
  G.loop++; clearTimeout(G.timer); TTS.stop(); clearCountdown(); setState('paused');
}
function stopGame() {
  if (!confirm('Fermare definitivamente la partita?')) return;
  TTS.stop(); finish('Partita interrotta');
}
function newGame() {
  if ((G.state === 'running' || G.state === 'paused' || G.state === 'win') && !confirm('C\'è una partita in corso. Iniziare una nuova partita?')) return;
  G.loop++; clearTimeout(G.timer); TTS.stop(); confettiRun++;
  $('#game').hidden = true; $('#setup').hidden = false; window.scrollTo(0, 0);
  renderRoster();
}
function exitApp() {
  if (!confirm('Uscire dal programma?')) return;
  G.loop++; TTS.stop();
  const app = plugin('App');
  if (app) app.exitApp(); else window.close();
}

/* ======================== AVVIO PARTITA ======================== */
function startFromSetup() {
  const m = $('#startMsg');
  if (!roster.length) return msg(m, 'Inserisci almeno un giocatore.', 'err');
  if (!enabledPrizes().length) return msg(m, 'Scegli almeno un premio (punto 3).', 'err');
  const tooMany = roster.find(p => p.cards.length > MAX_CARDS);
  if (tooMany) return msg(m, `${tooMany.name} ha più di 6 cartelle.`, 'err');
  msg(m, '');
  // memorizza nomi e cartelle per le prossime partite
  roster.forEach(p => { if (!GENERIC_NAME.test(p.name) && !known.some(n => n.toLowerCase() === p.name.toLowerCase())) known.push(p.name); });
  store.set('players', known); store.set('lastRoster', roster.filter(p => !GENERIC_NAME.test(p.name)).map(p => p.name)); refreshKnownNames();
  saveSettings();
  setupGame();
  $('#setup').hidden = true; $('#game').hidden = false; window.scrollTo(0, 0);
}

/* ========================= COLLEGAMENTI ========================= */
function applyTheme() {
  document.body.className = 'theme-' + settings.theme;
  $$('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === settings.theme));
}
function applyVoiceButtons() { $$('[data-voice]').forEach(b => b.classList.toggle('on', b.dataset.voice === settings.voice)); }
function applyVoiceOn() {
  $$('.voiceToggle').forEach(b => { b.textContent = settings.voiceOn ? '🔊 Voce ACCESA' : '🔇 Voce SPENTA'; b.classList.toggle('off', !settings.voiceOn); });
}
function applySpeed() {
  $('#speed').value = $('#speed2').value = settings.speed;
  $('#speedVal').textContent = $('#speedVal2').textContent = settings.speed;
}

function bind() {
  $$('[data-theme]').forEach(b => b.onclick = () => { settings.theme = b.dataset.theme; applyTheme(); saveSettings(); });
  $$('[data-voice]').forEach(b => b.onclick = () => { settings.voice = b.dataset.voice; settings.voiceName = ''; $('#voiceSelect').value = ''; applyVoiceButtons(); TTS.fillSelect(); saveSettings(); });
  $('#voiceSelect').onchange = e => { settings.voiceName = e.target.value; const v = TTS.voices.find(x => x.name === e.target.value); if (v && v.gender) { settings.voice = v.gender; applyVoiceButtons(); } saveSettings(); };
  [$('#speed'), $('#speed2')].forEach(r => r.oninput = e => { settings.speed = +e.target.value; applySpeed(); saveSettings(); });
  $$('.voiceToggle').forEach(b => b.onclick = () => { settings.voiceOn = !settings.voiceOn; if (!settings.voiceOn) TTS.stop(); applyVoiceOn(); saveSettings(); });
  $('#testVoice').onclick = () => { audio(); TTS.speak('Benvenuti al bingo! Il primo numero è il 90'); };

  $('#numPlayers').value = settings.numPlayers; $('#cardsPerPlayer').value = settings.cardsPerPlayer; $('#qCount').value = settings.cardsPerPlayer;
  $('#numPlayers').onchange = e => { let v = Math.round(+e.target.value || 1); v = Math.max(1, Math.min(MAX_PLAYERS, v)); e.target.value = v; settings.numPlayers = v; saveSettings(); };
  $('#cardsPerPlayer').onchange = e => { settings.cardsPerPlayer = +e.target.value; $('#qCount').value = e.target.value; saveSettings(); };
  $('#fillRoster').onclick = () => {
    const target = settings.numPlayers; let k = 1, added = 0;
    if (roster.length > target) return msg($('#qMsg'), `In elenco ci sono già ${roster.length} giocatori (più di ${target}).`, 'err');
    while (roster.length < target) {
      while (roster.some(p => p.name === 'Giocatore ' + k)) k++;
      if (addPlayer('Giocatore ' + k, '', settings.cardsPerPlayer, true)) break; added++;
    }
    renderRoster(); msg($('#qMsg'), `Aggiunti ${added} giocatori. Puoi rinominarli con ✏️.`, 'ok');
  };
  $('#loadLast').onclick = () => {
    const last = store.get('lastRoster', []).map(x => (typeof x === 'string' ? x : x.name)).filter(Boolean);
    if (!last.length) return msg($('#qMsg'), 'Nessuna partita precedente memorizzata.', 'err');
    if (roster.length && !confirm('Sostituire l\'elenco attuale con i giocatori dell\'ultima partita?')) return;
    roster = [];
    last.forEach(n => addPlayer(n, '', settings.cardsPerPlayer, true));
    renderRoster(); msg($('#qMsg'), `Caricati ${roster.length} giocatori dell'ultima partita.`, 'ok');
  };
  $('#clearMemory').onclick = () => {
    if (!confirm('Cancellare tutti i nomi e le cartelle memorizzati?\n(L\'elenco della partita attuale resta.)')) return;
    known = []; store.set('players', []); store.set('lastRoster', []); refreshKnownNames();
    msg($('#qMsg'), 'Memoria dei nomi azzerata.', 'ok');
  };
  $('#clearRoster').onclick = () => { if (roster.length && confirm('Svuotare l\'elenco dei giocatori?')) { roster = []; renderRoster(); } };

  const qName = $('#qName'), qCards = $('#qCards');
  const doAdd = () => {
    const err = addPlayer(qName.value, qCards.value, +$('#qCount').value);
    if (err) { msg($('#qMsg'), err, 'err'); return; }
    msg($('#qMsg'), `✔ ${roster[roster.length - 1].name}: cartelle ${roster[roster.length - 1].cards.join(', ')}`, 'ok');
    qName.value = ''; qCards.value = ''; $('#qCount').value = settings.cardsPerPlayer; qName.focus();
    const wrap = $('.roster-wrap'); wrap.scrollTop = wrap.scrollHeight;
  };
  $('#qAdd').onclick = doAdd;
  [qName, qCards].forEach(el => el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  $('#bulkAdd').onclick = () => {
    const lines = $('#bulkText').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const errs = []; let ok = 0;
    lines.forEach(l => {
      const [name, cards] = l.split(/[;\t]/);
      const err = addPlayer(name, cards || '', settings.cardsPerPlayer, true);
      if (err) errs.push(`${name}: ${err}`); else ok++;
    });
    renderRoster();
    msg($('#qMsg'), `Aggiunti ${ok} giocatori.` + (errs.length ? ' Problemi: ' + errs.slice(0, 5).join(' | ') : ''), errs.length ? 'err' : 'ok');
    if (!errs.length) $('#bulkText').value = '';
  };
  $('#rosterFilter').oninput = renderRoster;
  $('#roster').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i, p = roster[i]; if (!p) return;
    if (b.dataset.act === 'del') { roster.splice(i, 1); renderRoster(); }
    else if (b.dataset.act === 'edit') {
      roster.splice(i, 1); renderRoster();
      qName.value = GENERIC_NAME.test(p.name) ? '' : p.name; qCards.value = p.cards.join(', ');
      $('#qCount').value = p.cards.length; qName.focus();
      msg($('#qMsg'), `Modifica "${p.name}" e premi Aggiungi (cartelle ${p.cards.join(', ')}).`, 'ok');
      qName.scrollIntoView({ block: 'center' });
    } else if (b.dataset.act === 'print') {
      try { doPrint(p.cards.map(no => ({ no, name: p.name }))); } catch (er) { msg($('#printMsg'), er.message, 'err'); }
    }
  };

  renderPrizeChecks();
  $('#prizeChecks').onchange = e => { const k = e.target.dataset.prize; if (k) { settings.prizes[k] = e.target.checked; saveSettings(); renderPrizeTable(); } };
  $('#presetAll').onclick = () => { PRIZES.forEach(p => settings.prizes[p.key] = true); renderPrizeChecks(); renderPrizeTable(); saveSettings(); };
  $('#price').value = settings.price; $('#fee').value = settings.fee; $('#fixedPot').value = settings.fixedPot; $('#roundEuro').checked = settings.roundEuro;
  $('#price').oninput = e => { settings.price = Math.max(0, +e.target.value || 0); renderPrizeTable(); saveSettings(); };
  $('#fee').oninput = e => { settings.fee = Math.max(0, Math.min(100, +e.target.value || 0)); renderPrizeTable(); saveSettings(); };
  $('#fixedPot').oninput = e => { settings.fixedPot = e.target.value; renderPrizeTable(); saveSettings(); };
  $('#roundEuro').onchange = e => { settings.roundEuro = e.target.checked; renderPrizeTable(); saveSettings(); };

  $('#printBtn').onclick = () => { try { doPrint(cardsToPrint()); msg($('#printMsg'), ''); } catch (er) { msg($('#printMsg'), er.message, 'err'); } };
  $('#pdfBtn').onclick = async () => { try { msg($('#printMsg'), 'Preparo il PDF…'); await doPdf(cardsToPrint()); msg($('#printMsg'), 'PDF pronto.', 'ok'); } catch (er) { msg($('#printMsg'), er.message, 'err'); } };

  $('#startGame').onclick = startFromSetup;
  $('#bStart').onclick = start; $('#bResume').onclick = resume; $('#bPause').onclick = pause;
  $('#bStop').onclick = stopGame; $('#bNew').onclick = newGame; $('#bExit').onclick = exitApp;
  $('#checkBtn').onclick = () => {
    const no = +$('#checkNo').value;
    if (!no || no < 1 || no > MAX_CARD_NO) { $('#checkOut').innerHTML = '<p class="note">Numero di cartella non valido.</p>'; return; }
    const ci = G.byNo.get(no), c = ci !== undefined ? G.cards[ci] : null;
    $('#checkOut').innerHTML = cardHTML(no, c ? c.name : '(non in gioco)', c ? c.marked : new Set([...G.drawnSet]), -1);
  };
  $('#checkNo').onkeydown = e => { if (e.key === 'Enter') $('#checkBtn').click(); };
  $('#prizeStatus').onclick = e => { const a = e.target.closest('[data-card]'); if (a) { $('#checkNo').value = a.dataset.card; $('#checkBtn').click(); } };

  // tasti rapidi: spazio = pausa/riprendi
  document.addEventListener('keydown', e => {
    if ($('#game').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (G.state === 'idle') start(); else if (G.state === 'running') pause(); else resume(); }
  });
  // tasto Indietro su Android
  const app = plugin('App');
  if (app) app.addListener('backButton', () => { if (!$('#game').hidden) newGame(); else exitApp(); });
}

function init() {
  if (settings.speed > 10) settings.speed = 10;
  applyTheme(); applyVoiceButtons(); applyVoiceOn(); applySpeed();
  bind(); refreshKnownNames(); renderRoster(); buildBoard();
  TTS.init();
}
document.addEventListener('DOMContentLoaded', init);
