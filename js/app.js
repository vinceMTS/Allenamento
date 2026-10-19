// L'app: schermate, allenamento guidato, timer. Le regole stanno in logica.js, i dati in dati.js.
import * as L from './logica.js';
import * as D from './dati.js';

const VERSIONE_APP = '1.1.0';
const NOVITA_APP = "Ora puoi inserire il torneo dalla pagina Oggi: l'app sistema da sola gli allenamenti prima, durante e dopo. E puoi segnare un allenamento saltato, oggi oppure toccando il pallino di un giorno passato.";

const app = document.getElementById('app');
const elPausa = document.getElementById('pausa');
const elFoglio = document.getElementById('foglio');
const elToast = document.getElementById('toast');
const elImporta = document.getElementById('importa');

let scheda = null;
let dati = D.carica();
const ui = {
  prep: null, nota: { tipo: 'messaggio', testo: '' }, pausa: null, pausaInt: null,
  crono: null, cronoInt: null, foglio: null, riepilogo: null, wakeLock: null, rottaPrima: null,
  salto: null, torneo: null,
};

const GIORNI_SETTIMANA = [
  { id: 'forza', breve: 'Lun', giorno: 1 }, { id: 'atleta', breve: 'Mer', giorno: 3 },
  { id: 'spalle', breve: 'Ven', giorno: 5 }, { id: 'corsa', breve: 'Dom', giorno: 7 },
];

const MOTIVI_SALTO = [
  ['stanchezza', 'Stanco o giornata no'], ['impegni', 'Scuola o impegni'],
  ['salute', 'Malato o dolore'], ['tennis', 'Tennis o torneo'], ['altro', 'Altro motivo'],
];

// ---------- Utilità ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oggi = () => L.dataISO();
const salva = () => D.salva(dati);
const rotta = () => location.hash.replace(/^#\/?/, '').split('/');
const vai = (h) => { if (location.hash === h) render(); else location.hash = h; };

function nomeGiornata(id) {
  return id === 'corsa' ? scheda.corsa.nome : L.trovaGiornata(scheda, id)?.nome ?? id;
}

function infoSettimana(data = oggi()) {
  const sett = L.settimanaCiclo(dati.impostazioni.inizioCiclo, data);
  const iso = L.settimanaISO(data);
  const mant = !!dati.settimane[iso]?.mantenimento;
  const torneo = L.faseTorneo(dati.tornei, data);
  // Nella vigilia del torneo l'unico allenamento ammesso si fa leggero, come in mantenimento.
  const vigilia = torneo?.fase === 'vigilia';
  return {
    sett, iso, mant, torneo, vigilia,
    modalitaBase: mant || vigilia ? 'mantenimento' : 'normale',
    test: sett != null && sett >= 1 && L.eSettimanaTest(scheda, sett),
  };
}

function testoSettimana(info) {
  const n = scheda.settimaneCiclo;
  if (info.sett == null) return scheda.titolo;
  if (info.sett < 1) return `${scheda.titolo} · settimana di prova`;
  if (info.sett <= n) return `${scheda.titolo} · settimana ${info.sett} di ${n}`;
  if (info.sett === n + 1) return `${scheda.titolo} · settimana ${info.sett}: test e bilancio`;
  return `${scheda.titolo} finito: aggiorna la scheda con Claude`;
}

function unitaDi(es, conLato = true) {
  const base = es.tipo === 'tempo' ? 's' : '';
  const lato = es.perLato && conLato ? (es.unitaLato || (es.tipo === 'tempo' ? 'per lato' : 'per gamba')) : '';
  return [base, lato].filter(Boolean).join(' ');
}

function nomeVariante(es, id) {
  return L.variantiDi(es).find((v) => v.id === id)?.nome ?? id;
}

function toast(testo, ms = 2600) {
  elToast.textContent = testo;
  elToast.classList.add('visibile');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => elToast.classList.remove('visibile'), ms);
}

// ---------- Suono, vibrazione, schermo acceso ----------

let audio = null;
function sbloccaAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* niente audio */ }
}
function beep(volte = 1, freq = 880) {
  if (!dati.impostazioni.suono || !audio) return;
  try {
    for (let i = 0; i < volte; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      o.connect(g); g.connect(audio.destination);
      const t = audio.currentTime + i * 0.3;
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.25);
    }
  } catch { /* niente audio */ }
}
function vibra(schema) {
  if (dati.impostazioni.vibrazione && navigator.vibrate) navigator.vibrate(schema);
}
async function schermoAcceso(acceso) {
  try {
    if (acceso && 'wakeLock' in navigator && !ui.wakeLock) {
      ui.wakeLock = await navigator.wakeLock.request('screen');
      ui.wakeLock.addEventListener('release', () => { ui.wakeLock = null; });
    } else if (!acceso && ui.wakeLock) {
      await ui.wakeLock.release();
      ui.wakeLock = null;
    }
  } catch { /* non supportato */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && dati.inCorso && rotta()[0] === 'allena') schermoAcceso(true);
});

// ---------- Componenti ----------

function contatore(valore, { az = 'valore', passo = 1, unita = '', grande = true, campo = '' } = {}) {
  const testo = valore == null || valore === '' ? '–' : valore;
  return `<div class="contatore ${grande ? 'grande' : ''}">
    <button class="tondo" data-az="${az}" data-d="${-passo}" data-campo="${campo}" aria-label="meno">−</button>
    <div class="numero"><span>${esc(testo)}</span><small>${esc(unita)}</small></div>
    <button class="tondo" data-az="${az}" data-d="${passo}" data-campo="${campo}" aria-label="più">+</button>
  </div>`;
}

function interruttore(az, acceso, etichetta, extra = '') {
  return `<button class="interruttore ${acceso ? 'acceso' : ''}" data-az="${az}" ${extra} role="switch" aria-checked="${acceso}">
    <span class="leva"></span><span>${etichetta}</span></button>`;
}

function scelta(az, opzioni, attuale) {
  return `<div class="scelta">${opzioni.map(([v, t]) =>
    `<button class="${v === attuale ? 'sel' : ''}" data-az="${az}" data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div>`;
}

function nav(r) {
  const voci = [['', 'Oggi', '●'], ['scheda', 'Scheda', '☰'], ['storico', 'Storico', '↺'], ['altro', 'Altro', '⋯']];
  const attiva = ['test', 'note', 'regole'].includes(r) ? 'altro' : r;
  return `<nav class="barra">${voci.map(([h, t, i]) =>
    `<a href="#/${h}" class="${attiva === h ? 'attiva' : ''}"><span>${i}</span>${t}</a>`).join('')}</nav>`;
}

// I pallini della settimana. Con "tocca" i giorni passati non segnati (e quelli saltati) si possono toccare.
function puntiSettimana(data, tocca = false) {
  const iso = L.settimanaISO(data);
  const lun = L.lunediDi(data);
  const { fatti } = L.riassuntoSettimana(dati.allenamenti, iso);
  let daSegnare = false;
  const html = GIORNI_SETTIMANA.map((g) => {
    const giorno = L.aggiungiGiorni(lun, g.giorno - 1);
    const saltato = !fatti.has(g.id) && saltatoDi(g.id, iso);
    const torneo = !fatti.has(g.id) && !saltato && L.bloccataDalTorneo(dati.tornei, giorno, g.id);
    const vuoto = !fatti.has(g.id) && !saltato && !torneo && giorno < oggi();
    const [classe, segno] = fatti.has(g.id) ? ['fatto', '✓'] : saltato ? ['saltato', '–'] : torneo ? ['torneo', '🎾'] : vuoto ? ['vuoto', '?'] : ['', ''];
    const dentro = `<b>${segno}</b><span>${g.breve}</span><small>${esc(nomeGiornata(g.id))}</small>`;
    if (tocca && (vuoto || saltato)) {
      daSegnare = daSegnare || vuoto;
      return `<button class="punto ${classe}" data-az="apriGiorno" data-v="${g.id}" data-d="${giorno}">${dentro}</button>`;
    }
    return `<div class="punto ${classe}">${dentro}</div>`;
  }).join('');
  return `<div class="punti">${html}</div>
    ${daSegnare ? '<p class="piccolo">Tocca un pallino con il ? per segnare quell\'allenamento come fatto (lo ricopi) o come saltato.</p>' : ''}`;
}

function saltatoDi(giornata, iso) {
  return dati.saltati.find((s) => s.giornata === giornata && L.settimanaISO(s.data) === iso) || null;
}

function testoMotivo(m) {
  return (MOTIVI_SALTO.find(([k]) => k === m) || [m, m])[1];
}

// ---------- Schermata "Oggi" ----------

function vistaOggi() {
  const d = oggi();
  const info = infoSettimana(d);
  const imp = dati.impostazioni;
  const parti = [];

  parti.push(`<header class="testa"><p class="piccolo">${esc(L.dataLeggibile(d))}</p>
    <h1>${esc(testoSettimana(info))}</h1></header>`);

  if (dati.inCorso) {
    const c = dati.inCorso;
    parti.push(`<section class="carta evidenza"><h2>Allenamento in corso</h2>
      <p>${esc(c.nome)} del ${esc(L.dataLeggibile(c.data))}: sei arrivato al passo ${c.passo + 1} di ${c.passi.length}.</p>
      <div class="riga"><button class="btn primario" data-az="riprendi">Riprendi</button>
      <button class="btn" data-az="annullaInCorso">Annulla</button></div></section>`);
  }

  if (dati.appVista !== VERSIONE_APP) {
    parti.push(`<section class="carta evidenza"><h2>Novità dell'app</h2><p>${esc(NOVITA_APP)}</p>
      <button class="btn" data-az="appVista">Ok, ho letto</button></section>`);
  }

  if (dati.schedaVista !== scheda.versione) {
    parti.push(`<section class="carta"><h2>Scheda aggiornata</h2><p>${esc(scheda.novita)}</p>
      <button class="btn" data-az="schedaVista">Ok, ho letto</button></section>`);
  }

  if (!imp.inizioCiclo) {
    const lun = L.aggiungiGiorni(L.lunediDi(d), 7);
    parti.push(`<section class="carta evidenza"><h2>Quando inizia il ${esc(scheda.titolo.toLowerCase())}?</h2>
      <p>Serve all'app per sapere in che settimana sei (test, 2 o 3 giri). La settimana 1 è quella dei test.</p>
      <label class="campo">Lunedì di inizio<input type="date" data-imp="inizioCiclo" value=""></label>
      <button class="btn" data-az="inizioProssimo" data-v="${lun}">Lunedì prossimo (${esc(L.dataLeggibile(lun, false))})</button></section>`);
  } else if (info.sett < 1) {
    parti.push(`<section class="carta"><h2>Settimana di prova</h2>
      <p>Fai le giornate del ciclo con 2 giri, così impari gli esercizi nuovi. Il ciclo vero, con i test, parte <b>${esc(L.dataLeggibile(L.lunediDi(imp.inizioCiclo)))}</b>.</p></section>`);
  }

  if (info.test) {
    parti.push(`<section class="carta avviso"><h2>Settimana dei test</h2>
      <p>Ogni giorno: riscaldamento, i test del giorno, poi il resto dell'allenamento con 2 giri.</p></section>`);
  }

  // Prima, durante e subito dopo il torneo la carta del torneo va in alto; altrimenti dopo "Oggi".
  const torneoInAlto = info.torneo && info.torneo.fase !== 'prima';
  if (torneoInAlto) parti.push(cartaTorneo(d, info));

  const cons = L.giornataConsigliata(scheda, dati.allenamenti, d, dati.tornei);
  const fattoOggi = dati.allenamenti.filter((a) => a.data === d);
  const saltatoOggi = dati.saltati.find((s) => s.data === d);
  if (fattoOggi.length) {
    parti.push(`<section class="carta fatto"><h2>Fatto oggi ✓</h2>
      <p>${fattoOggi.map((a) => esc(a.nome) + (a.modalita === 'dieci' ? ' (10 minuti)' : '')).join(', ')}. Ben fatto.</p></section>`);
  } else if (saltatoOggi) {
    parti.push(`<section class="carta"><h2>Oggi salti: ${esc(nomeGiornata(saltatoOggi.giornata))}</h2>
      <p class="piccolo">Motivo: ${esc(testoMotivo(saltatoOggi.motivo))}. Se poi riesci ad allenarti, scegli l'allenamento qui sotto: il segno si toglie da solo.</p>
      <button class="btn" data-az="togliSaltato" data-v="${saltatoOggi.id}">Mi sono sbagliato, non salto</button></section>`);
  } else if (cons.id) {
    const g = cons.id === 'corsa' ? scheda.corsa : L.trovaGiornata(scheda, cons.id);
    parti.push(`<section class="carta oggi"><p class="piccolo">Oggi tocca a</p><h2 class="titolone">${esc(g.nome)}</h2>
      ${cons.motivo ? `<p class="nota-motivo">${esc(cons.motivo)}</p>` : ''}
      <p>${esc(cons.id === 'corsa' ? testoCorsa(info) : g.descrizione)}</p>
      <button class="btn primario largo" data-az="prepara" data-v="${cons.id}">Inizia</button>
      <button class="link" data-az="apriSalto" data-v="${cons.id}" data-d="${d}">Oggi non riesco ad allenarmi</button></section>`);
  } else {
    parti.push(`<section class="carta ${cons.torneo ? 'avviso' : ''}"><h2>${esc(cons.motivo)}</h2>
      ${cons.alternativa ? `<p class="piccolo">Se ti va, al massimo ${esc(nomeGiornata(cons.alternativa))} in versione leggera.</p>
        <button class="btn" data-az="prepara" data-v="${cons.alternativa}">${esc(nomeGiornata(cons.alternativa))} leggero</button>`
        : `<p class="piccolo">${cons.torneo ? 'Se ti alleni comunque, sceglilo qui sotto: viene segnato.' : 'Se oggi vuoi recuperare un allenamento, sceglilo qui sotto.'}</p>`}</section>`);
  }

  if (!torneoInAlto) parti.push(cartaTorneo(d, info));

  const r = L.riassuntoSettimana(dati.allenamenti, info.iso);
  parti.push(`<section class="carta"><h2>Questa settimana</h2>${puntiSettimana(d, true)}
    ${r.dieci ? `<p class="piccolo">Versione da 10 minuti usata ${r.dieci} ${r.dieci === 1 ? 'volta' : 'volte'}.</p>` : ''}
    ${r.dieci > 2 ? '<p class="avviso-testo">Più di due volte: parlane con Claude nella prossima conversazione.</p>' : ''}
    ${interruttore('mantenimento', info.mant, 'Settimana di mantenimento (settimana pesante)', `data-v="${info.iso}"`)}
    ${L.giornoSettimana(d) >= 5 ? interruttoreProssima(d) : ''}
  </section>`);

  parti.push(`<section class="carta"><h2>Altri allenamenti</h2><div class="griglia">
    ${GIORNI_SETTIMANA.map((g) => `<button class="btn" data-az="prepara" data-v="${g.id}">${esc(nomeGiornata(g.id))}</button>`).join('')}
    </div></section>`);

  const giorniExp = dati.ultimaEsportazione ? L.giorniTra(dati.ultimaEsportazione.slice(0, 10), d) : null;
  if (dati.allenamenti.length && (giorniExp == null || giorniExp >= 7)) {
    parti.push(`<section class="carta avviso"><h2>Ricordati di esportare</h2>
      <p>${giorniExp == null ? 'Non hai ancora mai esportato i dati.' : `Ultima esportazione ${giorniExp} giorni fa.`} I dati esistono solo su questo telefono.</p>
      <button class="btn" data-az="esporta">Esporta adesso</button></section>`);
  }

  parti.push(`<button class="btn largo" data-az="vai" data-v="#/note">✎ Scrivi un messaggio per Claude</button>`);
  return `<main class="pagina">${parti.join('')}</main>`;
}

function interruttoreProssima(d) {
  const iso = L.settimanaISO(L.aggiungiGiorni(L.lunediDi(d), 7));
  return interruttore('mantenimento', !!dati.settimane[iso]?.mantenimento, 'Anche la prossima settimana di mantenimento', `data-v="${iso}"`);
}

// ---------- Torneo ----------

const maiuscola = (x) => x.charAt(0).toUpperCase() + x.slice(1);

function dalAl(t) {
  const fine = t.fine || t.inizio;
  return fine === t.inizio ? L.dataLeggibile(t.inizio)
    : `dal ${L.dataLeggibile(t.inizio)} al ${L.dataLeggibile(fine)}`;
}

// Cosa cambia negli allenamenti, giorno per giorno.
function pianoTorneo(t) {
  const fine = t.fine || t.inizio;
  const g = (n) => esc(L.dataLeggibile(L.aggiungiGiorni(t.inizio, n)));
  return `<ul class="piano-torneo">
    <li><b>Fino a ${g(-3)}</b>: allenamenti normali.</li>
    <li><b>${maiuscola(g(-2))} e ${g(-1)}</b>: niente Forza, Atleta e corsa. Al massimo Spalle e core, leggero.</li>
    <li><b>${maiuscola(esc(dalAl(t)))}</b>: niente allenamenti a casa. Il riscaldamento di 12 minuti prima delle partite resta.</li>
    <li><b>${maiuscola(esc(L.dataLeggibile(L.aggiungiGiorni(fine, 1))))}</b>: giorno tranquillo. Il giorno dopo riprendi, se ti senti fresco.</li></ul>`;
}

function cartaTorneo(d, info) {
  const f = info.torneo;
  if (!f) {
    return `<section class="carta"><h2>🎾 Hai un torneo in arrivo?</h2>
      <p>Appena sai le date (basta il giorno della prima partita), inseriscile qui. L'app sistema da sola gli allenamenti dei giorni prima, durante e dopo.</p>
      <button class="btn largo" data-az="apriTorneo">Inserisci il torneo</button></section>`;
  }
  const t = f.torneo;
  const nome = esc(t.nome || 'Torneo');
  const modifica = '<button class="link" data-az="apriTorneo" data-v="modifica">Modifica le date</button>';

  if (f.fase === 'prima') {
    const spostaA = L.lunediDopoTorneo(t);
    const neiTest = L.torneoNeiTest(t, dati.impostazioni.inizioCiclo) && spostaA !== dati.impostazioni.inizioCiclo;
    return `<section class="carta evidenza"><h2>🎾 ${nome}: tra ${f.mancano} giorni</h2>
      <p>${maiuscola(esc(dalAl(t)))}.</p>${pianoTorneo(t)}
      ${neiTest ? `<div class="suggerimento"><p><b>Il torneo cade nella settimana dei test.</b> Conviene spostare l'inizio del ciclo a ${esc(L.dataLeggibile(spostaA))}, così fai i test da fresco.</p>
        <button class="btn primario" data-az="spostaCiclo" data-v="${spostaA}">Sposta l'inizio del ciclo</button></div>` : ''}
      ${modifica}</section>`;
  }
  if (f.fase === 'vigilia') {
    return `<section class="carta avviso"><h2>🎾 ${nome}: ${f.mancano === 1 ? 'domani la prima partita' : `tra ${f.mancano} giorni`}</h2>
      <p>Oggi niente Forza, Atleta e corsa: arrivi fresco alla prima partita.</p>${modifica}</section>`;
  }
  if (f.fase === 'torneo') {
    const fine = t.fine || t.inizio;
    return `<section class="carta evidenza"><h2>🎾 ${nome}: giorno ${f.giorno}${f.totale > 1 ? ` di ${f.totale}` : ''}</h2>
      <p>Niente allenamenti a casa. Il riscaldamento abituale di 12 minuti prima delle partite resta.</p>
      ${d < fine ? `<button class="btn largo" data-az="torneoFinito">Per me il torneo è finito oggi</button>
        <p class="piccolo">Toccalo se esci prima del ${esc(L.dataLeggibile(fine, false))}: gli allenamenti ripartono prima.</p>` : ''}
      <button class="link" data-az="apriAllenamentoTorneo">Mi sono allenato lo stesso: segnalo</button>
      ${modifica}</section>`;
  }
  return `<section class="carta"><h2>🎾 ${nome} finito</h2>
    <p>${f.giorno === 1 ? 'Oggi giorno tranquillo.' : 'Oggi puoi riprendere, se ti senti fresco.'} Com'è andata? Scrivilo a Claude: risultati, stanchezza, fastidi.</p>
    <button class="btn" data-az="vai" data-v="#/note">✎ Scrivi a Claude</button></section>`;
}

function foglioTorneo(modifica) {
  const t = modifica ? L.torneoDi(dati.tornei, oggi()) : null;
  ui.torneo = t ? { id: t.id, nome: t.nome || '', inizio: t.inizio, fine: t.fine || t.inizio }
    : { id: null, nome: '', inizio: '', fine: '' };
  const v = ui.torneo;
  apriFoglio(`<h2>${t ? 'Modifica il torneo' : 'Inserisci il torneo'}</h2>
    <label class="campo">Nome (facoltativo)<input type="text" data-tor="nome" value="${esc(v.nome)}" placeholder="Per esempio: Torneo under 18"></label>
    <label class="campo">Giorno della prima partita<input type="date" data-tor="inizio" value="${esc(v.inizio)}"></label>
    <label class="campo">Ultimo giorno in cui potresti giocare<input type="date" data-tor="fine" value="${esc(v.fine)}"></label>
    <p class="piccolo">Se non sai quando finisce, metti l'ultimo giorno possibile (per esempio la finale). Se esci prima, lo segni con un tocco dalla pagina Oggi.</p>
    <button class="btn primario largo" data-az="salvaTorneo">Salva</button>
    ${t ? '<button class="btn pericolo largo" data-az="eliminaTorneo">Elimina il torneo</button>' : ''}
    <button class="btn largo" data-az="chiudiFoglio">Annulla</button>`);
}

function salvaTorneo() {
  const v = ui.torneo;
  if (!v.inizio) { toast('Inserisci il giorno della prima partita'); return; }
  const fine = v.fine || v.inizio;
  if (fine < v.inizio) { toast('L\'ultimo giorno non può venire prima della prima partita'); return; }
  const vecchio = v.id && dati.tornei.find((t) => t.id === v.id);
  if (vecchio) Object.assign(vecchio, { nome: v.nome.trim(), inizio: v.inizio, fine });
  else dati.tornei.push({ id: D.nuovoId(), nome: v.nome.trim(), inizio: v.inizio, fine, creato: new Date().toISOString() });
  ui.torneo = null;
  salva(); chiudiFoglio(); render();
  toast('Torneo salvato: gli allenamenti si adattano da soli');
}

function foglioAllenamentoTorneo() {
  apriFoglio(`<h2>Quale allenamento hai fatto?</h2>
    <p class="piccolo">Va bene, succede. Viene segnato come fatto durante il torneo, così Claude lo sa.</p>
    ${GIORNI_SETTIMANA.map((g) => `<button class="voce" data-az="prepara" data-v="${g.id}"><span>${esc(nomeGiornata(g.id))}</span></button>`).join('')}
    <button class="btn largo" data-az="chiudiFoglio">Annulla</button>`);
}

// ---------- Allenamenti saltati ----------

function foglioSalto(giornata, data) {
  ui.salto = { giornata, data };
  const oggiStesso = data === oggi();
  apriFoglio(`<h2>Salti ${esc(nomeGiornata(giornata))}${oggiStesso ? ' oggi' : ` di ${esc(L.dataLeggibile(data))}`}?</h2>
    ${oggiStesso && giornata !== 'corsa' ? `<div class="suggerimento"><p>Hai 10 minuti? La versione corta conta come allenamento fatto.</p>
      <button class="btn primario largo" data-az="dieciOra" data-v="${giornata}">Faccio i 10 minuti</button></div>` : ''}
    <p class="piccolo">Perché salti? Lo legge Claude: serve a capire se c'è qualcosa da sistemare.</p>
    ${MOTIVI_SALTO.map(([k, t]) => `<button class="voce" data-az="segnaSaltato" data-v="${k}"><span>${esc(t)}</span></button>`).join('')}
    <button class="btn largo" data-az="chiudiFoglio">Annulla</button>`);
}

// Un pallino di un giorno passato: segnarlo come fatto (ricopiandolo) o come saltato.
function foglioGiorno(giornata, data) {
  const s = saltatoDi(giornata, L.settimanaISO(data));
  if (s) {
    apriFoglio(`<h2>${esc(nomeGiornata(giornata))} · ${esc(L.dataLeggibile(s.data))}</h2>
      <p>Segnato come saltato: ${esc(testoMotivo(s.motivo))}.</p>
      <button class="voce" data-az="togliSaltato" data-v="${s.id}"><span>Togli il segno "saltato"</span></button>
      <button class="btn largo" data-az="chiudiFoglio">Chiudi</button>`);
    return;
  }
  apriFoglio(`<h2>${esc(nomeGiornata(giornata))} · ${esc(L.dataLeggibile(data))}</h2>
    <p class="piccolo">Questo allenamento non risulta fatto.</p>
    <button class="voce" data-az="ricopia" data-v="${giornata}" data-d="${data}"><span>L'ho fatto: lo ricopio (dal foglio o a memoria)</span></button>
    <button class="voce" data-az="apriSalto" data-v="${giornata}" data-d="${data}"><span>L'ho saltato</span></button>
    <button class="btn largo" data-az="chiudiFoglio">Chiudi</button>`);
}

function pianoCorsa(info) {
  if (info.mant) return scheda.corsa.mantenimento;
  const s = info.sett == null || info.sett < 1 ? 2 : Math.min(info.sett, Object.keys(scheda.corsa.settimane).length);
  return scheda.corsa.settimane[String(s)] || scheda.corsa.settimane['5'];
}

function testoCorsa(info) {
  return pianoCorsa(info).testo;
}

// ---------- Preparazione ----------

function nuovaPrep(id, data = oggi()) {
  const info = infoSettimana(data);
  const giaTest = dati.test.some((t) => L.settimanaISO(t.data) === info.iso &&
    (scheda.test[id] || []).some((x) => x.chiave === t.chiave));
  return { giornata: id, modalita: 'normale', dove: id === 'corsa' ? 'strada' : 'garage',
    // Niente test al massimo a ridosso del torneo: si possono sempre attivare a mano.
    conTest: info.test && !giaTest && !(info.torneo && info.torneo.fase !== 'prima'), daCarta: data !== oggi(), data };
}

// Avviso nella preparazione se la regola dei tornei dice di non fare questo allenamento.
function avvisoTorneo(id, data) {
  if (!L.bloccataDalTorneo(dati.tornei, data, id)) return '';
  const f = L.faseTorneo(dati.tornei, data);
  const [titolo, regola] = f.fase === 'torneo'
    ? ['Sei nel torneo', 'durante il torneo niente allenamenti a casa']
    : f.fase === 'vigilia'
      ? ['Vigilia del torneo', 'nei 2 giorni prima della prima partita niente Forza, Atleta e corsa']
      : ['Giorno tranquillo dopo il torneo', 'il primo giorno dopo il torneo si riposa'];
  return `<section class="carta avviso"><h2>🎾 ${titolo}</h2>
    <p>La regola dice che ${regola}. Se lo fai comunque va bene: viene segnato, così Claude lo sa.</p></section>`;
}

function vistaPreparazione(id) {
  if (dati.inCorso) {
    return `<main class="pagina"><section class="carta evidenza"><h2>C'è già un allenamento in corso</h2>
      <p>${esc(dati.inCorso.nome)}: finiscilo o annullalo prima di iniziarne un altro.</p>
      <div class="riga"><button class="btn primario" data-az="riprendi">Riprendi</button>
      <button class="btn" data-az="annullaInCorso">Annulla</button></div></section></main>`;
  }
  if (!ui.prep || ui.prep.giornata !== id) ui.prep = nuovaPrep(id);
  const p = ui.prep;
  const info = infoSettimana(p.data);
  const corsa = id === 'corsa';
  const g = corsa ? scheda.corsa : L.trovaGiornata(scheda, id);
  if (!g) return vistaOggi();
  const modalita = p.modalita === 'dieci' ? 'dieci' : info.modalitaBase;
  const haTest = info.test && (scheda.test[id] || []).length;

  let corpo = avvisoTorneo(id, p.data);
  if (corsa) {
    const piano = pianoCorsa(info);
    corpo += `<section class="carta"><h2>Oggi</h2><p class="grande-testo">${esc(info.test && p.conTest ? scheda.test.corsa[0].nome : piano.testo)}</p>
      ${info.mant ? '<p class="piccolo">Settimana di mantenimento.</p>' : ''}
      ${piano.allunghi ? `<p class="piccolo">${esc(scheda.corsa.allungo)}</p>` : ''}
      <p class="piccolo">❄ ${esc(scheda.corsa.inverno)}</p></section>
      <section class="carta"><h2>Dove</h2>${scelta('prepDove', [['strada', 'In strada'], ['casa', 'In casa (20 minuti)']], p.dove)}</section>`;
  } else {
    const giri = L.giriPer(scheda, info.sett, modalita);
    corpo += `<section class="carta"><h2>Come va oggi?</h2>
      ${scelta('prepModalita', [['normale', info.vigilia ? 'Versione leggera' : info.mant ? 'Mantenimento' : 'Allenamento completo'], ['dieci', 'Giornata no: 10 minuti']], p.modalita)}
      <p class="piccolo">${modalita === 'dieci'
        ? 'Tre esercizi, 2 giri. Dopo, se ti va, continui. Se no va benissimo: conta come fatto.'
        : `${giri} giri · ${esc(L.riservaPer(g, modalita))} ripetizioni in riserva · ${esc(modalita === 'mantenimento' ? 'circa 20 minuti' : g.durata)}`}</p></section>
      <section class="carta"><h2>Dove</h2>${scelta('prepDove', [['garage', 'Garage'], ['casa', 'In casa']], p.dove)}
      <p class="piccolo">Sotto i 5 °C fuori (app meteo): in casa. In garage riscaldamento di 8-10 minuti e felpa fino alla fine del riscaldamento.</p></section>`;
    if (L.eserciziDi(g).some((e) => e.elastico)) {
      corpo += `<section class="carta">${interruttore('elastici', dati.impostazioni.elastici, 'Ho gli elastici')}
        <p class="piccolo">Senza elastici l'app propone le alternative scritte nella scheda.</p></section>`;
    }
    corpo += `<section class="carta"><h2>Cosa ti aspetta</h2><ol class="anteprima">${anteprima(g, modalita)}</ol></section>`;
  }
  if (haTest && modalita !== 'dieci') {
    corpo += `<section class="carta avviso">${interruttore('prepTest', p.conTest, 'Fai i test di oggi')}
      <p class="piccolo">${(scheda.test[id] || []).map((t) => esc(t.nome)).join(' · ')}</p></section>`;
  }
  corpo += `<section class="carta">${interruttore('prepCarta', p.daCarta, 'Lo ricopio dal foglio di carta')}
    ${p.daCarta ? `<label class="campo">Data dell'allenamento<input type="date" data-prep="data" value="${esc(p.data)}" max="${oggi()}"></label>
    <p class="piccolo">Niente timer né riscaldamento: inserisci solo i numeri.</p>` : ''}</section>`;

  return `<main class="pagina"><header class="testa"><button class="indietro" data-az="vai" data-v="#/">‹ Oggi</button>
    <h1>${esc(g.nome)}</h1><p class="piccolo">${esc(corsa ? '' : g.descrizione)}</p></header>
    ${corpo}<button class="btn primario largo fisso" data-az="inizia">Inizia</button></main>`;
}

function anteprima(g, modalita) {
  if (modalita === 'dieci') {
    return g.dieciMinuti.map((id) => `<li>${esc(L.esercizio(g, id).nome)}</li>`).join('');
  }
  return g.blocchi.map((b) => `<li>${b.esercizi.map((e) =>
    `${e.etichetta ? `<b>${esc(e.etichetta)}</b> ` : ''}${esc(e.nome)}`).join(' + ')}${b.facoltativo ? ' <i>(se resta tempo)</i>' : ''}</li>`).join('')
    + (g.mobilita ? `<li>${esc(g.mobilita.titolo)}</li>` : '');
}

function iniziaAllenamento() {
  sbloccaAudio();
  const p = ui.prep;
  const info = infoSettimana(p.data);
  const modalita = p.modalita === 'dieci' && p.giornata !== 'corsa' ? 'dieci' : info.modalitaBase;
  const conTest = p.conTest && info.test && modalita !== 'dieci';
  const passi = L.costruisciPassi(scheda, p.giornata, { settimana: info.sett, modalita, daCarta: p.daCarta, conTest });
  const c = {
    id: D.nuovoId(), giornata: p.giornata, nome: nomeGiornata(p.giornata), data: p.data,
    creato: new Date().toISOString(), settimanaCiclo: info.sett, modalita, daCarta: p.daCarta,
    dove: p.dove, conTest, schedaVersione: scheda.versione, passi, passo: 0,
    torneo: info.torneo && info.torneo.fase !== 'prima' ? { id: info.torneo.torneo.id, fase: info.torneo.fase } : null,
    esercizi: {}, ordine: [], test: {}, liste: {}, migliorie: 0,
    corsa: null, valore: null, voto: null, note: '', messaggio: '', dolore: '', conDolore: false,
  };
  if (p.giornata === 'corsa') {
    const piano = pianoCorsa(info);
    c.corsa = { minuti: p.dove === 'casa' ? 20 : piano.minuti ?? 25, km: '', allunghi: p.dove === 'casa' ? 0 : piano.allunghi ?? 0 };
  }
  aggiungiEsercizi(c, passi);
  dati.inCorso = c;
  ui.prep = null;
  preparaPasso();
  salva();
  if (!c.daCarta) schermoAcceso(true);
  vai('#/allena');
}

function aggiungiEsercizi(c, passi) {
  if (c.giornata === 'corsa') return;
  const g = L.trovaGiornata(scheda, c.giornata);
  for (const passo of passi) {
    if (passo.tipo !== 'serie' || c.esercizi[passo.es]) continue;
    const es = L.esercizio(g, passo.es);
    const ultima = L.ultimaVolta(dati.allenamenti, es.id);
    const vId = L.varianteIniziale(es, ultima, dati.impostazioni.elastici);
    c.esercizi[es.id] = { id: es.id, nome: es.nome, etichetta: es.etichetta, tipo: es.tipo, perLato: !!es.perLato,
      varianteId: vId, variante: nomeVariante(es, vId), serie: [], saltato: false, motivo: '' };
    c.ordine.push(es.id);
  }
}

// ---------- Allenamento guidato ----------

function passoCorrente() {
  const c = dati.inCorso;
  return c ? c.passi[c.passo] : null;
}

function datiEsercizio(id) {
  const c = dati.inCorso;
  const es = L.esercizio(L.trovaGiornata(scheda, c.giornata), id);
  const rec = c.esercizi[id];
  const ultima = L.ultimaVolta(dati.allenamenti, id);
  return { es, rec, ultima, stessa: ultima && ultima.varianteId === rec.varianteId };
}

// Quale serie migliorare oggi: la più bassa sotto il massimo (l'ultima se sono uguali).
function serieDaMigliorare(serie, max) {
  let idx = -1;
  let minimo = Infinity;
  serie.forEach((v, i) => { if (v < max && v <= minimo) { minimo = v; idx = i; } });
  return idx;
}

function obiettivoSerie(id, k) {
  const { es, rec, ultima, stessa } = datiEsercizio(id);
  const { min, max } = L.limiti(es, rec.varianteId);
  const passoV = es.tipo === 'tempo' ? 5 : 1;
  if (!stessa || es.progressione === false) {
    const prima = rec.serie[k - 2];
    return { proposto: stessa ? L.valoreProposto(es, rec.varianteId, ultima, k) : (prima ?? min), migliora: false };
  }
  const prec = ultima.serie[k - 1] ?? ultima.serie[ultima.serie.length - 1];
  const daMigliorare = serieDaMigliorare(ultima.serie, max);
  if (daMigliorare === k - 1 && dati.inCorso.modalita === 'normale') {
    return { proposto: Math.min(prec + passoV, max), migliora: true, prec };
  }
  return { proposto: prec, migliora: false, prec, quale: daMigliorare };
}

function preparaPasso() {
  const c = dati.inCorso;
  const p = passoCorrente();
  fermaCrono();
  if (!p) return;
  if (p.tipo === 'serie') {
    const rec = c.esercizi[p.es];
    c.valore = rec.serie[p.serie - 1] ?? obiettivoSerie(p.es, p.serie).proposto;
  } else if (p.tipo === 'test' && !c.test[p.chiave]) {
    const def = L.definizioneTest(scheda, p.chiave);
    const ultimo = [...dati.test].reverse().find((t) => t.chiave === p.chiave);
    c.test[p.chiave] = { valore: def.unita === 'kg' || def.unita === 'cm' ? ultimo?.valore ?? null : null,
      tentativi: def.tentativi ? Array(def.tentativi).fill(null) : null, min: null, sec: null,
      extra: { ...(ultimo?.extra || {}) } };
  }
}

function saltabile(p) {
  const rec = p && p.tipo === 'serie' && dati.inCorso.esercizi[p.es];
  return !!rec && (rec.saltato || rec.fermato);
}

function avanza() {
  const c = dati.inCorso;
  let i = c.passo + 1;
  while (i < c.passi.length - 1 && saltabile(c.passi[i])) i++;
  c.passo = Math.min(i, c.passi.length - 1);
  preparaPasso();
  salva();
}

function torna() {
  const c = dati.inCorso;
  let i = c.passo - 1;
  while (i > 0 && saltabile(c.passi[i])) i--;
  if (i < 0) return;
  c.passo = i;
  preparaPasso();
  salva();
}

function vistaAllena() {
  const c = dati.inCorso;
  if (!c) { setTimeout(() => vai('#/'), 0); return ''; }
  const p = passoCorrente();
  const progresso = Math.round((c.passo / (c.passi.length - 1)) * 100);
  let corpo = '';
  if (p.tipo === 'lista') corpo = vistaLista(p);
  else if (p.tipo === 'serie') corpo = vistaSerie(p);
  else if (p.tipo === 'test') corpo = vistaTestPasso(p);
  else if (p.tipo === 'corsa') corpo = vistaCorsaPasso();
  else corpo = vistaFine();
  return `<main class="pagina allena">
    <div class="sopra"><button class="indietro" data-az="esci">✕</button>
      <div class="avanzamento"><div style="width:${progresso}%"></div></div>
      <span class="piccolo">${esc(c.nome)}${c.modalita === 'dieci' ? ' · 10 min' : c.modalita === 'mantenimento' ? ' · mant.' : ''}</span></div>
    ${corpo}</main>`;
}

function vistaLista(p) {
  const c = dati.inCorso;
  const blocco = p.quale === 'mobilita' ? L.trovaGiornata(scheda, c.giornata).mobilita : scheda[p.quale];
  const spunte = c.liste[p.quale] || [];
  const freddo = p.quale === 'riscaldamento' && c.dove === 'garage';
  return `<h1>${esc(blocco.titolo)}</h1><p class="piccolo">${esc(blocco.durata)}</p>
    <ul class="spunte">${blocco.voci.map((v, i) =>
      `<li><button class="${spunte[i] ? 'ok' : ''}" data-az="spunta" data-v="${i}"><span class="casella">${spunte[i] ? '✓' : ''}</span>${esc(v)}</button></li>`).join('')}</ul>
    ${blocco.nota ? `<p class="${freddo ? 'avviso-testo' : 'piccolo'}">${esc(blocco.nota)}</p>` : ''}
    <div class="comandi">${c.passo > 0 ? '<button class="btn" data-az="torna">‹ Indietro</button>' : ''}
    <button class="btn primario largo" data-az="avanti">Fatto</button></div>`;
}

function vistaSerie(p) {
  const c = dati.inCorso;
  const { es, rec, ultima, stessa } = datiEsercizio(p.es);
  const g = L.trovaGiornata(scheda, c.giornata);
  const { min, max } = L.limiti(es, rec.varianteId);
  const ob = obiettivoSerie(p.es, p.serie);
  let sugg = p.serie === 1 && !rec.serie.length && c.modalita === 'normale' ? L.suggerimento(es, ultima) : null;
  if (sugg && sugg.id === rec.varianteId) sugg = null;
  const tempo = es.tipo === 'tempo';
  const intervallo = min === max ? `${min}` : `${min}-${max}`;

  let ultimaHtml = '';
  if (ultima) {
    ultimaHtml = `<div class="ultima"><p class="piccolo">L'ultima volta (${esc(L.dataLeggibile(ultima.data, false))}${stessa ? '' : `, ${esc(ultima.variante)}`})</p>
      <p class="serie-ultima">${ultima.serie.map((v, i) => `<span class="${stessa && i === p.serie - 1 ? 'qui' : ''}">${v}</span>`).join(' · ')}</p>
      ${!stessa ? `<p class="piccolo">Variante nuova: riparti dal minimo (${min}).</p>`
        : ob.migliora ? `<p class="spinta">Oggi prova ${ob.proposto} in questa serie!</p>`
        : es.progressione === false ? '' : `<p class="piccolo">Obiettivo: rifai ${ob.prec}${tempo ? ' s' : ''}.${ob.quale >= 0 && c.modalita === 'normale'
          ? ` La serie da migliorare oggi è la ${ob.quale + 1}ª.` : ''}</p>`}
    </div>`;
  } else if (es.progressione !== false) {
    ultimaHtml = `<div class="ultima"><p class="piccolo">Prima volta: scegli la variante con cui arrivi almeno a ${min}, restando a ${esc(L.riservaPer(g, c.modalita === 'dieci' ? 'mantenimento' : c.modalita))} dal limite.</p></div>`;
  }

  const oggiSerie = Array.from({ length: p.di }, (_, i) =>
    `<span class="${i === p.serie - 1 ? 'ora' : ''}">${rec.serie[i] ?? '–'}</span>`);
  return `<p class="etichetta">${esc(es.etichetta)}${es.etichetta ? ' · ' : ''}serie ${p.serie} di ${p.di}</p>
    <h1 class="nome-es">${esc(es.nome)}</h1>
    <button class="variante" data-az="apriVarianti">${esc(rec.variante)} <span>cambia</span></button>
    <p class="obiettivo">${intervallo} ${esc(unitaDi(es) || 'ripetizioni')} · ${esc(L.riservaPer(g, c.modalita === 'dieci' ? 'mantenimento' : c.modalita))} in riserva</p>
    ${es.nota ? `<p class="piccolo">${esc(es.nota)}</p>` : ''}
    ${sugg ? `<div class="suggerimento"><p><b>L'ultima volta hai fatto il massimo in tutte le serie!</b> Oggi passa a: ${esc(sugg.nome)}</p>
      <button class="btn primario" data-az="variante" data-v="${sugg.id}">Passa a questa variante</button></div>` : ''}
    ${ultimaHtml}
    ${tempo && !c.daCarta ? cronometro() : ''}
    ${contatore(c.valore, { passo: tempo ? 5 : 1, unita: tempo ? 'secondi' : (es.perLato ? unitaDi(es) : 'ripetizioni') })}
    <p class="oggi-serie">Oggi: ${oggiSerie.join('')}</p>
    <div class="comandi">
      ${c.passo > 0 ? '<button class="btn" data-az="torna">‹</button>' : ''}
      <button class="btn primario largo" data-az="serieFatta">Serie fatta ✓</button></div>
    <div class="comandi secondari">
      ${p.facoltativo && p.serie === 1 ? '<button class="link" data-az="salta" data-v="facoltativo">Salta (è facoltativo)</button>'
        : '<button class="link" data-az="apriSalta">Salta questo esercizio</button>'}
    </div>`;
}

function cronometro() {
  const attivo = !!ui.crono;
  const sec = attivo ? Math.floor((Date.now() - ui.crono.inizio) / 1000) : 0;
  return `<div class="crono"><span id="crono-tempo">${L.mmss(sec)}</span>
    <button class="btn ${attivo ? 'pericolo' : ''}" data-az="crono">${attivo ? 'Stop' : '▶ Cronometro'}</button></div>`;
}

function fermaCrono() {
  clearInterval(ui.cronoInt);
  ui.crono = null;
}

function avviaCrono() {
  sbloccaAudio();
  const obiettivo = dati.inCorso.valore;
  ui.crono = { inizio: Date.now(), obiettivo, suonato: false };
  clearInterval(ui.cronoInt);
  ui.cronoInt = setInterval(() => {
    const sec = Math.floor((Date.now() - ui.crono.inizio) / 1000);
    const el = document.getElementById('crono-tempo');
    if (el) el.textContent = L.mmss(sec);
    if (!ui.crono.suonato && ui.crono.obiettivo && sec >= ui.crono.obiettivo) {
      ui.crono.suonato = true;
      beep(2); vibra([200, 100, 200]);
    }
  }, 250);
}

function serieFatta() {
  const c = dati.inCorso;
  const p = passoCorrente();
  const { es, rec, ultima, stessa } = datiEsercizio(p.es);
  if (c.valore == null) return;
  const primaVolta = rec.serie[p.serie - 1] == null;
  rec.serie[p.serie - 1] = c.valore;
  if (stessa && primaVolta && es.progressione !== false) {
    const prec = ultima.serie[p.serie - 1];
    if (prec != null && c.valore > prec) {
      c.migliorie++;
      toast(`+${c.valore - prec}${es.tipo === 'tempo' ? ' s' : ''} rispetto all'ultima volta!`);
    }
  }
  const riposo = es.riposo || scheda.riposoSecondi;
  avanza();
  if (!c.daCarta && passoCorrente()?.tipo === 'serie') avviaPausa(riposo);
  render();
}

// ---------- Pausa ----------

function avviaPausa(sec) {
  ui.pausa = { fine: Date.now() + sec * 1000 };
  clearInterval(ui.pausaInt);
  ui.pausaInt = setInterval(tickPausa, 250);
  disegnaPausa();
}

function tickPausa() {
  if (!ui.pausa) return;
  const resto = Math.ceil((ui.pausa.fine - Date.now()) / 1000);
  if (resto <= 0) { finePausa(true); return; }
  const el = document.getElementById('pausa-tempo');
  if (el) el.textContent = L.mmss(resto);
}

function finePausa(suona) {
  clearInterval(ui.pausaInt);
  ui.pausa = null;
  if (suona) { beep(3); vibra([300, 120, 300]); }
  disegnaPausa();
}

function disegnaPausa() {
  if (!ui.pausa || !dati.inCorso) { elPausa.innerHTML = ''; elPausa.classList.remove('visibile'); return; }
  const p = passoCorrente();
  let dopo = '';
  if (p?.tipo === 'serie') {
    const { es, rec, ultima, stessa } = datiEsercizio(p.es);
    const prec = stessa ? ultima.serie[p.serie - 1] : null;
    dopo = `<p class="piccolo">Dopo</p><h2>${esc(es.etichetta)} ${esc(es.nome)}</h2>
      <p>${esc(rec.variante)} · serie ${p.serie} di ${p.di}</p>
      ${prec != null ? `<p class="piccolo">L'ultima volta in questa serie: ${prec}${es.tipo === 'tempo' ? ' s' : ''}</p>` : ''}`;
  }
  const resto = Math.max(0, Math.ceil((ui.pausa.fine - Date.now()) / 1000));
  elPausa.innerHTML = `<div class="pausa-dentro"><p class="piccolo">Pausa</p>
    <div class="pausa-tempo" id="pausa-tempo">${L.mmss(resto)}</div>${dopo}
    <div class="comandi"><button class="btn" data-az="piuPausa">+15 s</button>
    <button class="btn primario" data-az="saltaPausa">Vai</button></div></div>`;
  elPausa.classList.add('visibile');
}

// ---------- Passo test ----------

function vistaTestPasso(p) {
  const c = dati.inCorso;
  const def = L.definizioneTest(scheda, p.chiave);
  const t = c.test[p.chiave];
  const ultimo = [...dati.test].reverse().find((x) => x.chiave === p.chiave);
  let campo = '';
  if (def.tentativi) {
    campo = `<div class="tentativi">${t.tentativi.map((v, i) => `<label class="campo">Tentativo ${i + 1}
      <input type="number" inputmode="numeric" data-c="test.${p.chiave}.tentativi.${i}" value="${v ?? ''}"> </label>`).join('')}</div>
      <p class="piccolo">Vale il migliore${t.tentativi.some((v) => v != null) ? `: <b>${Math.max(...t.tentativi.filter((v) => v != null))} ${esc(def.unita)}</b>` : ''}.</p>`;
  } else if (def.tipo === 'tempo-gara') {
    campo = `<div class="tentativi"><label class="campo">Minuti<input type="number" inputmode="numeric" data-c="test.${p.chiave}.min" value="${t.min ?? ''}"></label>
      <label class="campo">Secondi<input type="number" inputmode="numeric" data-c="test.${p.chiave}.sec" value="${t.sec ?? ''}"></label></div>`;
  } else {
    if (def.cronometro && !c.daCarta) campo += cronometro();
    // Per peso e circonferenze si scrive il numero: partire da zero con +/− sarebbe scomodo.
    const conContatore = !['kg', 'cm'].includes(def.unita) || def.negativo;
    if (conContatore) campo += contatore(t.valore, { az: 'valoreTest', passo: def.passo, unita: def.unita, campo: p.chiave });
    campo += `<label class="campo">${conContatore ? 'Oppure scrivi il numero' : `Scrivi il numero (${esc(def.unita)})`}<input type="number" step="any" inputmode="decimal" data-c="test.${p.chiave}.valore" value="${t.valore ?? ''}"></label>`;
  }
  const extra = (def.extra || []).map((x) => `<label class="campo">${esc(x.nome)}
    <input type="text" data-c="test.${p.chiave}.extra.${x.chiave}" value="${esc(t.extra[x.chiave] ?? '')}" placeholder="${esc(x.esempio || '')}"></label>`).join('');
  return `<p class="etichetta">Test${def.facoltativo ? ' · facoltativo' : ''}</p><h1 class="nome-es">${esc(def.nome)}</h1>
    <p class="istruzioni">${esc(def.istruzioni)}</p>
    ${ultimo ? `<p class="piccolo">Ultima misura (${esc(L.dataLeggibile(ultimo.data, false))}): <b>${esc(testoValoreTest(ultimo))}</b></p>` : ''}
    ${campo}${extra}
    <div class="comandi">${c.passo > 0 ? '<button class="btn" data-az="torna">‹</button>' : ''}
    <button class="btn primario largo" data-az="avanti">Salva e avanti</button></div>
    <div class="comandi secondari"><button class="link" data-az="saltaTest" data-v="${p.chiave}">Salta questo test</button></div>`;
}

function valoreTest(def, t) {
  if (!t) return null;
  if (def.tentativi) {
    const v = t.tentativi.filter((x) => x != null && x !== '');
    return v.length ? Math.max(...v.map(Number)) : null;
  }
  if (def.tipo === 'tempo-gara') {
    if (t.min == null && t.sec == null) return null;
    return Number(t.min || 0) * 60 + Number(t.sec || 0);
  }
  return t.valore == null || t.valore === '' ? null : Number(t.valore);
}

function testoValoreTest(t) {
  if (t.unita === 'min:s') return L.mmss(t.valore);
  return `${t.valore} ${t.unita}`;
}

// ---------- Passo corsa ----------

function vistaCorsaPasso() {
  const c = dati.inCorso;
  const info = infoSettimana(c.data);
  const piano = c.dove === 'casa' ? { testo: '20 minuti in casa: riscaldamento lungo con saltelli e skip', allunghi: 0 } : pianoCorsa(info);
  return `<p class="etichetta">Corsa${c.dove === 'casa' ? ' · in casa' : ''}</p><h1 class="nome-es">${esc(piano.testo)}</h1>
    ${piano.allunghi ? `<p class="piccolo">${esc(scheda.corsa.allungo)}</p>` : ''}
    <p class="piccolo">Quando hai finito, segna com'è andata.</p>
    <h2>Minuti</h2>${contatore(c.corsa.minuti, { az: 'valoreCorsa', campo: 'minuti', unita: 'minuti' })}
    ${piano.allunghi || c.corsa.allunghi ? `<h2>Allunghi</h2>${contatore(c.corsa.allunghi, { az: 'valoreCorsa', campo: 'allunghi', unita: 'allunghi', grande: false })}` : ''}
    <label class="campo">Chilometri (se li sai)<input type="number" step="0.1" inputmode="decimal" data-c="corsa.km" value="${esc(c.corsa.km)}"></label>
    <div class="comandi"><button class="btn primario largo" data-az="avanti">Avanti</button></div>`;
}

// ---------- Fine ----------

function vistaFine() {
  const c = dati.inCorso;
  const voti = [[1, 'malissimo'], [2, 'male'], [3, 'così così'], [4, 'bene'], [5, 'benissimo']];
  const fatti = c.ordine.map((id) => c.esercizi[id]).filter((e) => e.serie.some((v) => v != null) || e.saltato);
  return `<h1>Finito!</h1>
    ${c.migliorie ? `<p class="spinta">Hai migliorato ${c.migliorie} serie rispetto all'ultima volta.</p>` : ''}
    ${c.modalita === 'dieci' && !c.iniziatoDieci ? `<div class="carta"><p>I 10 minuti contano come allenamento fatto. Ti va di continuare?</p>
      <button class="btn" data-az="continuaDieci">Sì, faccio il resto della scheda</button></div>` : ''}
    ${fatti.length ? `<ul class="riepilogo">${fatti.map((e) => `<li><b>${esc(e.etichetta)} ${esc(e.nome)}</b> <span>${esc(e.variante)}</span>
      <em>${e.saltato ? 'saltato' : e.serie.filter((v) => v != null).join(' · ')}</em></li>`).join('')}</ul>` : ''}
    <h2>Com'è andata?</h2>
    <div class="voti">${voti.map(([v, t]) => `<button class="${c.voto === v ? 'sel' : ''}" data-az="voto" data-v="${v}"><b>${v}</b><small>${t}</small></button>`).join('')}</div>
    ${interruttore('conDolore', c.conDolore, 'Qualcosa ha fatto male (dolore, non fatica)')}
    ${c.conDolore ? `<label class="campo">Dove e quando?<textarea data-c="dolore" rows="2">${esc(c.dolore)}</textarea></label>
      <p class="avviso-testo">Se il dolore è forte, peggiora o non passa: fermati e senti un medico o un fisioterapista.</p>` : ''}
    <label class="campo">Note (come ti sentivi, sonno, indolenzimento…)<textarea data-c="note" rows="3">${esc(c.note)}</textarea></label>
    <label class="campo">Messaggio per Claude (facoltativo)<textarea data-c="messaggio" rows="2">${esc(c.messaggio)}</textarea></label>
    <div class="comandi">${c.passo > 0 ? '<button class="btn" data-az="torna">‹</button>' : ''}
    <button class="btn primario largo" data-az="salvaAllenamento">Salva l'allenamento</button></div>`;
}

function continuaDopoDieci() {
  const c = dati.inCorso;
  const info = infoSettimana(c.data);
  const modalita = info.modalitaBase;
  const fatte = (id) => (c.esercizi[id]?.serie || []).filter((v) => v != null).length;
  const nuovi = L.costruisciPassi(scheda, c.giornata, { settimana: c.settimanaCiclo, modalita, daCarta: c.daCarta, conTest: false })
    .filter((p) => !(p.tipo === 'lista' && p.quale === 'riscaldamento'))
    .filter((p) => !(p.tipo === 'serie' && p.serie <= fatte(p.es)));
  aggiungiEsercizi(c, nuovi);
  c.passi = c.passi.slice(0, c.passo).concat(nuovi);
  c.modalita = modalita;
  c.iniziatoDieci = true;
  preparaPasso();
  salva();
  render();
}

function salvaAllenamento() {
  const c = dati.inCorso;
  if (c.voto == null) { toast('Scegli un voto da 1 a 5'); return; }
  const rec = {
    id: c.id, data: c.data, creato: c.creato, salvato: new Date().toISOString(),
    giornata: c.giornata, nome: c.nome, settimanaCiclo: c.settimanaCiclo, modalita: c.modalita,
    iniziatoDieci: !!c.iniziatoDieci, daCarta: c.daCarta, dove: c.dove, schedaVersione: c.schedaVersione,
    esercizi: c.ordine.map((id) => c.esercizi[id])
      .map((e) => ({ ...e, serie: e.serie.filter((v) => v != null) }))
      .filter((e) => e.serie.length || (e.saltato && e.motivo !== 'facoltativo')),
    voto: c.voto, note: c.note.trim(), dolore: c.conDolore ? c.dolore.trim() || 'sì' : '',
  };
  if (c.torneo) rec.torneo = c.torneo;
  if (c.corsa && c.passi.some((p) => p.tipo === 'corsa')) {
    rec.corsa = { minuti: c.corsa.minuti, km: c.corsa.km === '' ? null : Number(c.corsa.km), allunghi: c.corsa.allunghi };
  }
  const testFatti = [];
  for (const [chiave, t] of Object.entries(c.test)) {
    if (t.saltato) continue;
    const def = L.definizioneTest(scheda, chiave);
    const valore = valoreTest(def, t);
    if (valore == null) continue;
    dati.test.push({ id: D.nuovoId(), data: c.data, settimanaCiclo: c.settimanaCiclo, allenamento: c.id,
      chiave, nome: def.nome, unita: def.unita, valore,
      tentativi: t.tentativi ? t.tentativi.filter((v) => v != null && v !== '').map(Number) : undefined,
      extra: Object.keys(t.extra || {}).length ? t.extra : undefined });
    testFatti.push(chiave);
  }
  if (testFatti.length) rec.test = testFatti;
  if (c.messaggio.trim()) {
    dati.note.push({ id: D.nuovoId(), data: c.data, creato: new Date().toISOString(), tipo: 'messaggio',
      testo: c.messaggio.trim(), allenamento: c.id });
  }
  dati.allenamenti.push(rec);
  // Se quel giorno (o quella giornata, nella stessa settimana) era segnato come saltato, il segno si toglie.
  dati.saltati = dati.saltati.filter((s) => s.data !== rec.data &&
    !(s.giornata === rec.giornata && L.settimanaISO(s.data) === L.settimanaISO(rec.data)));

  // Suggerimenti per la prossima volta (doppia progressione).
  const g = c.giornata === 'corsa' ? null : L.trovaGiornata(scheda, c.giornata);
  const prossima = [];
  if (g && rec.modalita === 'normale') {
    for (const e of rec.esercizi) {
      const es = L.esercizio(g, e.id);
      const s = es && L.suggerimento(es, { modalita: 'normale', varianteId: e.varianteId, serie: e.serie });
      if (s) prossima.push({ nome: es.nome, variante: s.nome });
    }
  }
  ui.riepilogo = { rec, migliorie: c.migliorie, prossima };
  dati.inCorso = null;
  salva();
  finePausa(false);
  schermoAcceso(false);
  vai('#/fatto');
}

function vistaFatto() {
  const r = ui.riepilogo;
  if (!r) { setTimeout(() => vai('#/'), 0); return ''; }
  const info = infoSettimana(r.rec.data);
  const { totale } = L.riassuntoSettimana(dati.allenamenti, info.iso);
  return `<main class="pagina fine"><div class="festa">✓</div><h1>Allenamento salvato</h1>
    <p class="grande-testo">${esc(r.rec.nome)}: fatto. ${totale > 1 ? `È il ${totale}° di questa settimana.` : 'Il primo di questa settimana.'}</p>
    ${r.migliorie ? `<p class="spinta">${r.migliorie} ${r.migliorie === 1 ? 'serie migliorata' : 'serie migliorate'} rispetto all'ultima volta.</p>` : ''}
    <section class="carta">${puntiSettimana(r.rec.data)}</section>
    ${r.prossima.length ? `<section class="carta evidenza"><h2>La prossima volta</h2><ul>${r.prossima.map((x) =>
      `<li>${esc(x.nome)}: massimo raggiunto in tutte le serie → passa a <b>${esc(x.variante)}</b></li>`).join('')}</ul></section>` : ''}
    ${r.rec.dolore ? '<section class="carta avviso"><p>Hai segnato un dolore: scrivilo anche a Claude nella prossima conversazione. Se è acuto o peggiora, senti un medico o un fisioterapista.</p></section>' : ''}
    <button class="btn primario largo" data-az="vai" data-v="#/">Torna a Oggi</button></main>`;
}

// ---------- Fogli (finestre dal basso) ----------

function apriFoglio(html) {
  elFoglio.innerHTML = `<div class="foglio-sfondo" data-az="chiudiFoglio"></div><div class="foglio-dentro">${html}</div>`;
  elFoglio.classList.add('visibile');
}
function chiudiFoglio() {
  elFoglio.classList.remove('visibile');
  elFoglio.innerHTML = '';
}

function foglioVarianti() {
  const p = passoCorrente();
  const { es, rec } = datiEsercizio(p.es);
  const scala = (es.varianti || []);
  const alt = (es.alternative || []);
  const voce = (v, n) => `<button class="voce ${v.id === rec.varianteId ? 'sel' : ''}" data-az="variante" data-v="${v.id}">
    ${n ? `<b>${n}</b>` : ''}<span>${esc(v.nome)}</span></button>`;
  apriFoglio(`<h2>${esc(es.nome)}</h2>
    ${scala.length > 1 ? '<p class="piccolo">Dalla più facile alla più difficile</p>' : ''}
    ${scala.map((v, i) => voce(v, i + 1)).join('')}
    ${alt.length ? `<p class="piccolo">${es.elastico ? 'Senza elastici' : 'Alternative'}</p>${alt.map((v) => voce(v)).join('')}` : ''}
    <button class="btn largo" data-az="chiudiFoglio">Chiudi</button>`);
}

function foglioSalta() {
  apriFoglio(`<h2>Saltare l'esercizio?</h2><p class="piccolo">Le serie già fatte restano salvate.</p>
    <button class="voce" data-az="salta" data-v="dolore"><span>Fa male (dolore, non fatica)</span></button>
    <button class="voce" data-az="salta" data-v="spazio"><span>Manca lo spazio o l'attrezzatura</span></button>
    <button class="voce" data-az="salta" data-v="tempo"><span>Non ho tempo</span></button>
    <button class="voce" data-az="salta" data-v="altro"><span>Altro motivo</span></button>
    <button class="btn largo" data-az="chiudiFoglio">No, continuo</button>`);
}

function foglioEsci() {
  apriFoglio(`<h2>Interrompere?</h2>
    <button class="voce" data-az="pausaAllenamento"><span>Esco e riprendo più tardi (resta salvato)</span></button>
    <button class="voce pericolo" data-az="annullaInCorso"><span>Annulla l'allenamento (non viene salvato)</span></button>
    <button class="btn largo primario" data-az="chiudiFoglio">Continua l'allenamento</button>`);
}

// ---------- Scheda ----------

function vistaScheda(id) {
  const info = infoSettimana();
  const scelte = [...scheda.giornate.map((g) => [g.id, g.nome]), ['corsa', 'Corsa'], ['speciali', 'Altre versioni']];
  const sel = scelte.some(([v]) => v === id) ? id : (L.giornataConsigliata(scheda, dati.allenamenti, oggi(), dati.tornei).id || 'forza');
  const tab = `<div class="schede">${scelte.map(([v, t]) => `<a href="#/scheda/${v}" class="${v === sel ? 'sel' : ''}">${esc(t)}</a>`).join('')}</div>`;
  let corpo = '';
  if (sel === 'corsa') corpo = schedaCorsa(info);
  else if (sel === 'speciali') corpo = schedaSpeciali();
  else corpo = schedaGiornata(L.trovaGiornata(scheda, sel), info);
  return `<main class="pagina"><header class="testa"><h1>Scheda</h1>
    <p class="piccolo">${esc(scheda.titolo)} · aggiornata il ${esc(L.dataLeggibile(scheda.aggiornata, false))} · <a href="stampa.html" target="_blank">versione da stampare</a></p></header>
    ${tab}${corpo}</main>`;
}

function schedaGiornata(g, info) {
  const modalita = info.modalitaBase;
  const blocchi = g.blocchi.map((b) => `<section class="carta"><h2>${b.facoltativo ? 'Se resta tempo' : `Coppia ${esc(b.coppia)}`}</h2>
    ${b.esercizi.map((e) => {
      const ultima = L.ultimaVolta(dati.allenamenti, e.id);
      const giri = L.giriPer(scheda, info.sett, modalita, e);
      const interv = e.min === e.max ? `${e.min}` : `${e.min}-${e.max}`;
      return `<div class="es"><h3>${esc(e.etichetta)} ${esc(e.nome)}</h3>
        <p class="obiettivo">${giri} × ${interv} ${esc(unitaDi(e) || 'ripetizioni')}</p>
        ${e.nota ? `<p class="piccolo">${esc(e.nota)}</p>` : ''}
        <ol class="scala">${(e.varianti || []).map((v) => `<li class="${ultima?.varianteId === v.id ? 'sel' : ''}">${esc(v.nome)}</li>`).join('')}</ol>
        ${e.alternative?.length ? `<p class="piccolo">${e.elastico ? 'Senza elastici' : 'Alternative'}: ${e.alternative.map((v) =>
          `<span class="${ultima?.varianteId === v.id ? 'sel' : ''}">${esc(v.nome)}</span>`).join(' · ')}</p>` : ''}
        ${ultima ? `<p class="piccolo">Ultima volta: ${esc(ultima.variante)}, ${ultima.serie.join(' · ')}</p>` : ''}</div>`;
    }).join('')}</section>`).join('');
  return `<section class="carta"><p>${esc(g.descrizione)}</p>
    <p class="obiettivo">${esc(L.riservaPer(g, modalita))} ripetizioni in riserva · ${esc(g.durata)}</p>
    <p class="piccolo">Riscaldamento 5 minuti (8-10 con il freddo), poi le coppie: A1, pausa 45 s, A2, pausa 45 s, e si ricomincia.</p></section>
    ${blocchi}
    ${g.mobilita ? `<section class="carta"><h2>${esc(g.mobilita.titolo)} (${esc(g.mobilita.durata)})</h2><ul>${g.mobilita.voci.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></section>` : ''}
    <section class="carta"><h2>10 minuti (giornata no)</h2><p>${g.dieciMinuti.map((id) => esc(L.esercizio(g, id).nome)).join(' · ')}</p>
      <p class="piccolo">2 minuti di riscaldamento, poi 2 giri.</p></section>
    <section class="carta"><h2>Perché questi esercizi</h2><p>${esc(g.perche)}</p></section>`;
}

function schedaCorsa(info) {
  const righe = Object.entries(scheda.corsa.settimane).map(([s, v]) =>
    `<tr class="${String(info.sett) === s ? 'sel' : ''}"><td>${s}</td><td>${esc(v.testo)}</td></tr>`).join('');
  return `<section class="carta"><table class="tabella"><tr><th>Sett.</th><th>Cosa fare</th></tr>${righe}
    <tr><td>Mant.</td><td>${esc(scheda.corsa.mantenimento.testo)}</td></tr></table>
    <p class="piccolo">${esc(scheda.corsa.allungo)}</p><p class="piccolo">❄ ${esc(scheda.corsa.inverno)}</p></section>
    <section class="carta"><h2>Perché</h2><p>${esc(scheda.corsa.perche)}</p></section>`;
}

function schedaSpeciali() {
  const voci = (b) => `<section class="carta"><h2>${esc(b.titolo)} (${esc(b.durata)})</h2><ul>${b.voci.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
    ${b.nota ? `<p class="piccolo">${esc(b.nota)}</p>` : ''}</section>`;
  const regole = scheda.regole.filter((r) => /mantenimento|10 minuti|Tornei/.test(r.titolo));
  return voci(scheda.riscaldamento) + voci(scheda.defaticamento)
    + regole.map((r) => `<section class="carta"><h2>${esc(r.titolo)}</h2>${r.testo.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`).join('');
}

// ---------- Storico ----------

function vistaStorico() {
  // Allenamenti, allenamenti saltati e tornei, insieme e per settimana.
  const voci = [
    ...dati.allenamenti.map((a) => ({ tipo: 'allenamento', data: a.data, ord: a.creato, a })),
    ...dati.saltati.map((s) => ({ tipo: 'saltato', data: s.data, ord: s.creato, s })),
    ...dati.tornei.map((t) => ({ tipo: 'torneo', data: t.inizio, ord: t.creato, t })),
  ].sort((x, y) => y.data.localeCompare(x.data) || (y.ord || '').localeCompare(x.ord || ''));
  if (!voci.length) {
    return `<main class="pagina"><header class="testa"><h1>Storico</h1></header>
      <section class="carta"><p>Ancora nessun allenamento salvato.</p></section></main>`;
  }
  const gruppi = new Map();
  for (const v of voci) {
    const k = L.settimanaISO(v.data);
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k).push(v);
  }
  const riga = (v) => {
    if (v.tipo === 'saltato') {
      return `<div class="voce"><b>${esc(L.dataLeggibile(v.data))}</b><span>Saltato: ${esc(nomeGiornata(v.s.giornata))} · ${esc(testoMotivo(v.s.motivo))}</span></div>`;
    }
    if (v.tipo === 'torneo') {
      return `<div class="voce"><b>🎾 ${esc(v.t.nome || 'Torneo')}</b><span>${esc(dalAl(v.t))}${v.t.finitoIl ? ' (finito prima)' : ''}</span></div>`;
    }
    const a = v.a;
    return `<a class="voce" href="#/storico/${a.id}"><b>${esc(L.dataLeggibile(a.data))}</b>
      <span>${esc(a.nome)}${a.modalita === 'dieci' ? ' · 10 min' : ''}${a.daCarta ? ' · da carta' : ''}${a.torneo ? ' · 🎾 torneo' : ''}${a.dolore ? ' · ⚠ dolore' : ''}</span>
      <em>${a.voto ? `voto ${a.voto}` : ''}</em></a>`;
  };
  const html = [...gruppi.entries()].map(([iso, lista]) => {
    const sett = lista.find((v) => v.tipo === 'allenamento')?.a.settimanaCiclo;
    return `<section class="carta"><h2>${esc(iso)}${sett >= 1 ? ` · settimana ${sett} del ciclo` : ''}${dati.settimane[iso]?.mantenimento ? ' · mantenimento' : ''}</h2>
      ${lista.map(riga).join('')}</section>`;
  }).join('');
  const n = dati.allenamenti.length;
  return `<main class="pagina"><header class="testa"><h1>Storico</h1><p class="piccolo">${n} ${n === 1 ? 'allenamento' : 'allenamenti'}</p></header>${html}</main>`;
}

function vistaDettaglio(id) {
  const a = dati.allenamenti.find((x) => x.id === id);
  if (!a) return vistaStorico();
  const test = dati.test.filter((t) => t.allenamento === a.id);
  return `<main class="pagina"><header class="testa"><button class="indietro" data-az="vai" data-v="#/storico">‹ Storico</button>
    <h1>${esc(a.nome)}</h1><p class="piccolo">${esc(L.dataLeggibile(a.data))} · ${esc(a.dove || '')}${a.modalita !== 'normale' ? ` · ${a.modalita === 'dieci' ? '10 minuti' : 'mantenimento'}` : ''}${a.daCarta ? ' · da carta' : ''}</p></header>
    ${a.esercizi.length ? `<section class="carta"><ul class="riepilogo">${a.esercizi.map((e) => `<li><b>${esc(e.etichetta)} ${esc(e.nome)}</b> <span>${esc(e.variante)}</span>
      <em>${e.saltato ? `saltato (${esc(e.motivo)})` : e.serie.join(' · ') + (e.tipo === 'tempo' ? ' s' : '')}</em></li>`).join('')}</ul></section>` : ''}
    ${a.corsa ? `<section class="carta"><p>${a.corsa.minuti} minuti${a.corsa.km ? ` · ${a.corsa.km} km` : ''}${a.corsa.allunghi ? ` · ${a.corsa.allunghi} allunghi` : ''}</p></section>` : ''}
    ${test.length ? `<section class="carta"><h2>Test</h2><ul>${test.map((t) => `<li>${esc(t.nome)}: <b>${esc(testoValoreTest(t))}</b></li>`).join('')}</ul></section>` : ''}
    <section class="carta"><p>Voto: <b>${a.voto ?? '–'}</b></p>${a.note ? `<p>${esc(a.note)}</p>` : ''}${a.dolore ? `<p class="avviso-testo">Dolore: ${esc(a.dolore)}</p>` : ''}</section>
    <button class="btn pericolo largo" data-az="eliminaAllenamento" data-v="${a.id}">Elimina questo allenamento</button></main>`;
}

// ---------- Test, note, regole, altro ----------

function vistaTest() {
  const ordine = Object.values(scheda.test).flat();
  const righe = ordine.map((def) => {
    const ris = dati.test.filter((t) => t.chiave === def.chiave).sort((a, b) => a.data.localeCompare(b.data));
    return `<div class="es"><h3>${esc(def.nome)}</h3>${ris.length
      ? `<p>${ris.map((t) => `<span class="pillola">${esc(L.dataLeggibile(t.data, false))}: <b>${esc(testoValoreTest(t))}</b>${t.extra ? ` <small>${esc(Object.values(t.extra).filter(Boolean).join(', '))}</small>` : ''}</span>`).join(' ')}</p>`
      : '<p class="piccolo">Nessun risultato</p>'}</div>`;
  }).join('');
  return `<main class="pagina"><header class="testa"><button class="indietro" data-az="vai" data-v="#/altro">‹ Altro</button><h1>Risultati dei test</h1>
    <p class="piccolo">I test si fanno nella settimana ${scheda.settimaneTest.join(' e nella settimana ')} del ciclo, dentro l'allenamento del giorno.</p></header>
    <section class="carta">${righe}</section></main>`;
}

function vistaNote() {
  const n = ui.nota;
  const lista = [...dati.note].sort((a, b) => (b.creato || '').localeCompare(a.creato || ''));
  const esp = dati.ultimaEsportazione;
  return `<main class="pagina"><header class="testa"><h1>Note e messaggi</h1>
    <p class="piccolo">Finiscono nel file esportato: Claude li legge all'inizio della conversazione.</p></header>
    <section class="carta">${scelta('tipoNota', [['messaggio', 'Messaggio per Claude'], ['nota', 'Nota per il diario']], n.tipo)}
      <label class="campo"><textarea data-nota="testo" rows="4" placeholder="${n.tipo === 'messaggio' ? 'Una domanda, una richiesta, un dubbio sulla scheda…' : 'Come stai, sonno, stanchezza, scuola, tennis…'}">${esc(n.testo)}</textarea></label>
      <button class="btn primario largo" data-az="salvaNota">Salva</button></section>
    ${lista.map((x) => `<section class="carta nota"><p class="piccolo">${x.tipo === 'messaggio' ? 'Messaggio per Claude' : 'Nota'} · ${esc(L.dataLeggibile(x.data, false))}${!esp || x.creato > esp ? ' · non ancora esportato' : ''}</p>
      <p>${esc(x.testo)}</p><button class="link" data-az="eliminaNota" data-v="${x.id}">Elimina</button></section>`).join('')}</main>`;
}

function vistaRegole() {
  return `<main class="pagina"><header class="testa"><button class="indietro" data-az="vai" data-v="#/altro">‹ Altro</button><h1>Le regole</h1></header>
    ${scheda.regole.map((r) => `<section class="carta"><h2>${esc(r.titolo)}</h2>${r.testo.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`).join('')}</main>`;
}

function vistaAltro() {
  const imp = dati.impostazioni;
  const esp = dati.ultimaEsportazione;
  return `<main class="pagina"><header class="testa"><h1>Altro</h1></header>
    <section class="carta evidenza"><h2>Esporta per Claude</h2>
      <p>Crea un file con tutti i tuoi dati. Salvalo nella cartella <b>da-te</b> con l'app OneDrive. Vale anche come copia di sicurezza.</p>
      <p class="piccolo">${esp ? `Ultima esportazione: ${esc(L.dataLeggibile(esp.slice(0, 10)))}` : 'Non hai ancora esportato.'}</p>
      <button class="btn primario largo" data-az="esporta">Esporta</button></section>
    <section class="carta"><div class="griglia">
      <button class="btn" data-az="vai" data-v="#/test">Risultati dei test</button>
      <button class="btn" data-az="vai" data-v="#/note">Note e messaggi</button>
      <button class="btn" data-az="vai" data-v="#/regole">Le regole</button>
      <a class="btn" href="stampa.html" target="_blank">Scheda da stampare</a></div></section>
    <section class="carta"><h2>Impostazioni</h2>
      <label class="campo">Lunedì di inizio del ciclo<input type="date" data-imp="inizioCiclo" value="${esc(imp.inizioCiclo || '')}"></label>
      ${interruttore('elastici', imp.elastici, 'Ho gli elastici')}
      ${interruttore('impSuono', imp.suono, 'Suono a fine pausa')}
      ${interruttore('impVibrazione', imp.vibrazione, 'Vibrazione a fine pausa')}</section>
    <section class="carta"><h2>Recupera i dati</h2>
      <p class="piccolo">Su un telefono nuovo: importa l'ultimo file esportato. I dati si aggiungono, non si cancella niente.</p>
      <button class="btn" data-az="importa">Importa un file</button></section>
    <section class="carta"><p class="piccolo">App ${VERSIONE_APP} · scheda ${esc(scheda.versione)} · <span id="persistenza"></span></p>
      <button class="link" data-az="aggiornaScheda">Controlla se la scheda è cambiata</button></section></main>`;
}

// ---------- Azioni ----------

const azioni = {
  vai: (el) => vai(el.dataset.v),
  prepara: (el) => { ui.prep = null; chiudiFoglio(); vai(`#/inizia/${el.dataset.v}`); },
  inizia: iniziaAllenamento,
  riprendi: () => { chiudiFoglio(); if (!dati.inCorso.daCarta) schermoAcceso(true); vai('#/allena'); },
  annullaInCorso: () => {
    if (!confirm('Annullare l\'allenamento in corso? Quello che hai segnato non viene salvato.')) return;
    dati.inCorso = null; salva(); chiudiFoglio(); finePausa(false); fermaCrono(); schermoAcceso(false); vai('#/');
  },
  esci: foglioEsci,
  pausaAllenamento: () => { chiudiFoglio(); finePausa(false); fermaCrono(); schermoAcceso(false); vai('#/'); },
  schedaVista: () => { dati.schedaVista = scheda.versione; salva(); render(); },
  appVista: () => { dati.appVista = VERSIONE_APP; salva(); render(); },
  apriTorneo: (el) => foglioTorneo(el.dataset.v === 'modifica'),
  salvaTorneo,
  eliminaTorneo: () => {
    if (!confirm('Eliminare il torneo? Gli allenamenti tornano quelli normali.')) return;
    dati.tornei = dati.tornei.filter((t) => t.id !== ui.torneo.id);
    salva(); chiudiFoglio(); render();
  },
  torneoFinito: () => {
    const t = L.torneoDi(dati.tornei, oggi());
    if (!t || !confirm('Il torneo per te è finito oggi? Domani giorno tranquillo, poi si riprende.')) return;
    t.fine = oggi(); t.finitoIl = oggi();
    salva(); render(); toast("Segnato. Com'è andata? Scrivilo a Claude.");
  },
  spostaCiclo: (el) => {
    dati.impostazioni.inizioCiclo = el.dataset.v;
    salva(); render(); toast(`Il ciclo parte ${L.dataLeggibile(el.dataset.v)}`);
  },
  apriAllenamentoTorneo: foglioAllenamentoTorneo,
  apriSalto: (el) => foglioSalto(el.dataset.v, el.dataset.d),
  apriGiorno: (el) => foglioGiorno(el.dataset.v, el.dataset.d),
  dieciOra: (el) => {
    chiudiFoglio();
    ui.prep = { ...nuovaPrep(el.dataset.v), modalita: 'dieci' };
    location.hash = `#/inizia/${el.dataset.v}`;
  },
  ricopia: (el) => {
    chiudiFoglio();
    ui.prep = nuovaPrep(el.dataset.v, el.dataset.d);
    location.hash = `#/inizia/${el.dataset.v}`;
  },
  segnaSaltato: (el) => {
    const { giornata, data } = ui.salto;
    dati.saltati = dati.saltati.filter((s) => !(s.giornata === giornata && L.settimanaISO(s.data) === L.settimanaISO(data)));
    dati.saltati.push({ id: D.nuovoId(), data, creato: new Date().toISOString(), giornata, motivo: el.dataset.v });
    ui.salto = null;
    salva(); chiudiFoglio(); render();
    toast(el.dataset.v === 'salute' ? 'Segnato. Se è un dolore, scrivilo a Claude.' : 'Segnato. Alla prossima!');
  },
  togliSaltato: (el) => {
    dati.saltati = dati.saltati.filter((s) => s.id !== el.dataset.v);
    salva(); chiudiFoglio(); render();
  },
  inizioProssimo: (el) => { dati.impostazioni.inizioCiclo = el.dataset.v; salva(); render(); },
  mantenimento: (el) => {
    const iso = el.dataset.v;
    const att = !!dati.settimane[iso]?.mantenimento;
    dati.settimane[iso] = { ...(dati.settimane[iso] || {}), mantenimento: !att };
    salva(); render();
  },
  elastici: () => { dati.impostazioni.elastici = !dati.impostazioni.elastici; salva(); render(); },
  impSuono: () => { dati.impostazioni.suono = !dati.impostazioni.suono; salva(); render(); },
  impVibrazione: () => { dati.impostazioni.vibrazione = !dati.impostazioni.vibrazione; salva(); render(); },
  prepModalita: (el) => { ui.prep.modalita = el.dataset.v; render(); },
  prepDove: (el) => { ui.prep.dove = el.dataset.v; render(); },
  prepTest: () => { ui.prep.conTest = !ui.prep.conTest; render(); },
  prepCarta: () => { ui.prep.daCarta = !ui.prep.daCarta; if (!ui.prep.daCarta) ui.prep.data = oggi(); render(); },

  avanti: () => { avanza(); render(); },
  torna: () => { torna(); render(); },
  spunta: (el) => {
    const c = dati.inCorso; const q = passoCorrente().quale;
    c.liste[q] = c.liste[q] || [];
    c.liste[q][el.dataset.v] = !c.liste[q][el.dataset.v];
    salva(); render();
  },
  valore: (el) => {
    const c = dati.inCorso;
    c.valore = Math.max(0, (Number(c.valore) || 0) + Number(el.dataset.d));
    render();
  },
  serieFatta,
  crono: () => {
    if (ui.crono) {
      const sec = Math.floor((Date.now() - ui.crono.inizio) / 1000);
      fermaCrono();
      const p = passoCorrente();
      if (p.tipo === 'test') dati.inCorso.test[p.chiave].valore = sec;
      else dati.inCorso.valore = sec;
      salva();
    } else avviaCrono();
    render();
  },
  apriVarianti: foglioVarianti,
  variante: (el) => {
    const c = dati.inCorso; const p = passoCorrente();
    const { es, rec } = datiEsercizio(p.es);
    rec.varianteId = el.dataset.v;
    rec.variante = nomeVariante(es, el.dataset.v);
    c.valore = obiettivoSerie(p.es, p.serie).proposto;
    salva(); chiudiFoglio(); render();
  },
  apriSalta: foglioSalta,
  salta: (el) => {
    const c = dati.inCorso; const p = passoCorrente();
    const rec = c.esercizi[p.es];
    const motivi = { dolore: 'fa male', spazio: 'manca spazio o attrezzatura', tempo: 'non c\'era tempo', altro: 'altro motivo', facoltativo: 'facoltativo' };
    // Se qualche serie è già fatta si tiene, e si saltano solo le restanti.
    if (rec.serie.some((v) => v != null)) rec.fermato = true;
    else rec.saltato = true;
    rec.motivo = motivi[el.dataset.v];
    if (el.dataset.v === 'dolore') {
      c.conDolore = true;
      c.dolore = [c.dolore, `${rec.nome}: dolore, esercizio saltato`].filter(Boolean).join('. ');
    }
    chiudiFoglio(); avanza(); render();
  },
  piuPausa: () => { if (ui.pausa) { ui.pausa.fine += 15000; tickPausa(); } },
  saltaPausa: () => finePausa(false),
  valoreTest: (el) => {
    const t = dati.inCorso.test[el.dataset.campo];
    const def = L.definizioneTest(scheda, el.dataset.campo);
    const base = t.valore == null || t.valore === '' ? 0 : Number(t.valore);
    let v = Math.round((base + Number(el.dataset.d)) * 100) / 100;
    if (!def.negativo) v = Math.max(0, v);
    t.valore = v; salva(); render();
  },
  saltaTest: (el) => { dati.inCorso.test[el.dataset.v].saltato = true; avanza(); render(); },
  valoreCorsa: (el) => {
    const c = dati.inCorso;
    c.corsa[el.dataset.campo] = Math.max(0, (Number(c.corsa[el.dataset.campo]) || 0) + Number(el.dataset.d));
    salva(); render();
  },
  voto: (el) => { dati.inCorso.voto = Number(el.dataset.v); salva(); render(); },
  conDolore: () => { dati.inCorso.conDolore = !dati.inCorso.conDolore; salva(); render(); },
  continuaDieci: continuaDopoDieci,
  salvaAllenamento,

  chiudiFoglio,
  eliminaAllenamento: (el) => {
    if (!confirm('Eliminare questo allenamento? Non si può tornare indietro.')) return;
    dati.allenamenti = dati.allenamenti.filter((a) => a.id !== el.dataset.v);
    dati.test = dati.test.filter((t) => t.allenamento !== el.dataset.v);
    salva(); vai('#/storico');
  },
  tipoNota: (el) => { ui.nota.tipo = el.dataset.v; render(); },
  salvaNota: () => {
    const testo = ui.nota.testo.trim();
    if (!testo) { toast('Scrivi qualcosa prima di salvare'); return; }
    dati.note.push({ id: D.nuovoId(), data: oggi(), creato: new Date().toISOString(), tipo: ui.nota.tipo, testo });
    ui.nota.testo = '';
    salva(); toast('Salvato'); render();
  },
  eliminaNota: (el) => {
    if (!confirm('Eliminare questa nota?')) return;
    dati.note = dati.note.filter((n) => n.id !== el.dataset.v);
    salva(); render();
  },
  esporta: async () => {
    const esito = await D.esporta(dati, VERSIONE_APP, scheda.versione, oggi());
    if (esito === 'annullato') return;
    dati.ultimaEsportazione = new Date().toISOString();
    salva(); render();
    toast(esito === 'condiviso' ? 'Fatto. Controlla che sia finito in da-te.' : 'File scaricato: spostalo nella cartella da-te.');
  },
  importa: () => elImporta.click(),
  aggiornaScheda: async () => { const cambiata = await caricaScheda(true); toast(cambiata ? 'Scheda aggiornata' : 'La scheda è già la più recente'); render(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-az]');
  if (!el) return;
  const f = azioni[el.dataset.az];
  if (f) { e.preventDefault(); f(el, e); }
});

// Campi di testo e numeri: aggiornano i dati senza ridisegnare (così la tastiera non si chiude).
function impostaPercorso(radice, percorso, valore) {
  const parti = percorso.split('.');
  let o = radice;
  for (const p of parti.slice(0, -1)) o = o[p];
  o[parti[parti.length - 1]] = valore;
}

document.addEventListener('input', (e) => {
  const el = e.target;
  const num = el.type === 'number';
  const v = num ? (el.value === '' ? null : Number(el.value)) : el.value;
  if (el.dataset.c && dati.inCorso) {
    impostaPercorso(dati.inCorso, el.dataset.c, v);
    if (el.dataset.c.startsWith('corsa.km')) dati.inCorso.corsa.km = el.value;
    salva();
  } else if (el.dataset.nota) {
    ui.nota[el.dataset.nota] = v;
  } else if (el.dataset.tor && ui.torneo) {
    ui.torneo[el.dataset.tor] = v;
    // L'ultimo giorno parte uguale alla prima partita: di solito si cambia di poco.
    if (el.dataset.tor === 'inizio' && (!ui.torneo.fine || ui.torneo.fine < v)) {
      ui.torneo.fine = v;
      const campo = elFoglio.querySelector('[data-tor="fine"]');
      if (campo) campo.value = v;
    }
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.imp) {
    dati.impostazioni[el.dataset.imp] = el.value || null;
    salva(); render();
  } else if (el.dataset.prep) {
    ui.prep[el.dataset.prep] = el.value || oggi();
    render();
  } else if (el.dataset.c && el.closest('.tentativi')) {
    render();
  }
});

elImporta.addEventListener('change', async () => {
  const file = elImporta.files[0];
  elImporta.value = '';
  if (!file) return;
  try {
    const contenuto = JSON.parse(await file.text());
    const { dati: nuovi, aggiunti } = D.unisci(dati, contenuto);
    if (!confirm(`Il file contiene ${aggiunti} elementi nuovi (allenamenti, test, note). Aggiungerli?`)) return;
    dati = nuovi; salva(); render();
    toast(`Aggiunti ${aggiunti} elementi`);
  } catch (err) {
    alert(`Non riesco a leggere il file: ${err.message}`);
  }
});

// ---------- Avvio ----------

function render() {
  if (!scheda) { app.innerHTML = '<main class="pagina"><p>Carico la scheda…</p></main>'; return; }
  const r = rotta();
  const viste = {
    '': vistaOggi, inizia: () => vistaPreparazione(r[1]), allena: vistaAllena, fatto: vistaFatto,
    scheda: () => vistaScheda(r[1]), storico: () => (r[1] ? vistaDettaglio(r[1]) : vistaStorico()),
    test: vistaTest, note: vistaNote, regole: vistaRegole, altro: vistaAltro,
  };
  const vista = viste[r[0]] || vistaOggi;
  const conNav = !['allena', 'inizia', 'fatto'].includes(r[0]);
  app.innerHTML = vista() + (conNav ? nav(r[0]) : '');
  if (r[0] !== 'allena') { finePausa(false); }
  disegnaPausa();
  const chiave = location.hash;
  if (ui.rottaPrima !== chiave) { window.scrollTo(0, 0); ui.rottaPrima = chiave; }
  if (r[0] === 'altro') mostraPersistenza();
}

async function mostraPersistenza() {
  const el = document.getElementById('persistenza');
  if (!el) return;
  const ok = await D.chiediPersistenza();
  el.textContent = ok ? 'dati protetti dalla pulizia automatica' : 'dati non protetti dalla pulizia automatica: esporta spesso';
}

async function caricaScheda(forza = false) {
  const prima = scheda?.versione;
  try {
    const r = await fetch('scheda.json', { cache: forza ? 'reload' : 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    scheda = await r.json();
    localStorage.setItem('allenamento-scheda', JSON.stringify(scheda));
  } catch {
    const copia = localStorage.getItem('allenamento-scheda');
    if (copia && !scheda) scheda = JSON.parse(copia);
  }
  return prima && scheda && prima !== scheda.versione;
}

window.addEventListener('hashchange', () => { chiudiFoglio(); render(); });

(async function avvia() {
  render();
  await caricaScheda();
  if (!scheda) { app.innerHTML = '<main class="pagina"><p>Non riesco a caricare la scheda. Collegati a internet e riapri l\'app.</p></main>'; return; }
  render();
  D.chiediPersistenza();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
