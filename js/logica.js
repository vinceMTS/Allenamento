// Regole del programma: date, settimane del ciclo, giri, ultima volta, progressione.
// Nessun accesso alla pagina qui dentro: solo calcoli, così si possono provare da soli.

// ---------- Date (sempre ora locale, formato AAAA-MM-GG) ----------

export function dataISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daData(s) {
  const [a, m, g] = s.split('-').map(Number);
  return new Date(a, m - 1, g);
}

export function aggiungiGiorni(s, n) {
  const d = daData(s);
  d.setDate(d.getDate() + n);
  return dataISO(d);
}

// 1 = lunedì ... 7 = domenica
export function giornoSettimana(s) {
  const g = daData(s).getDay();
  return g === 0 ? 7 : g;
}

export function lunediDi(s) {
  return aggiungiGiorni(s, 1 - giornoSettimana(s));
}

export function giorniTra(da, a) {
  return Math.round((daData(a) - daData(da)) / 86400000);
}

// Settimana ISO nel formato del progetto: 2026-S46
export function settimanaISO(s) {
  const d = daData(s);
  const giovedi = new Date(d);
  giovedi.setDate(d.getDate() + 4 - (giornoSettimana(s)));
  const anno = giovedi.getFullYear();
  const primoGennaio = new Date(anno, 0, 1);
  const n = Math.floor(Math.round((giovedi - primoGennaio) / 86400000) / 7) + 1;
  return `${anno}-S${String(n).padStart(2, '0')}`;
}

const NOMI_GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const NOMI_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function nomeGiorno(n) { return NOMI_GIORNI[n]; }

export function dataLeggibile(s, conGiorno = true) {
  const d = daData(s);
  const base = `${d.getDate()} ${NOMI_MESI[d.getMonth()]}`;
  return conGiorno ? `${nomeGiorno(giornoSettimana(s))} ${base}` : base;
}

// ---------- Ciclo ----------

// Numero della settimana del ciclo (1 = settimana dei test). 0 o meno = non ancora iniziato.
export function settimanaCiclo(inizio, oggi) {
  if (!inizio) return null;
  const giorni = giorniTra(lunediDi(inizio), oggi);
  return Math.floor(giorni / 7) + 1;
}

export function eSettimanaTest(scheda, sett) {
  return (scheda.settimaneTest || []).includes(sett);
}

export function giriPer(scheda, sett, modalita, es) {
  let giri;
  if (sett == null || sett < 1) giri = scheda.giriPerSettimana['1'];
  else giri = scheda.giriPerSettimana[String(sett)] ?? scheda.giriDopoIlCiclo;
  if (modalita === 'mantenimento') giri = Math.min(giri, 2);
  if (modalita === 'dieci') giri = 2;
  if (es && es.giriMax) giri = Math.min(giri, es.giriMax);
  return giri;
}

export function riservaPer(giornata, modalita) {
  return modalita === 'mantenimento' ? '3-4' : giornata.riserva;
}

// ---------- Scheda ----------

export function trovaGiornata(scheda, id) {
  if (id === 'corsa') return scheda.corsa;
  return scheda.giornate.find((g) => g.id === id);
}

export function eserciziDi(giornata) {
  const lista = [];
  for (const b of giornata.blocchi || []) lista.push(...b.esercizi);
  return lista.concat(giornata.eserciziExtra || []);
}

export function esercizio(giornata, id) {
  return eserciziDi(giornata).find((e) => e.id === id);
}

// Tutte le varianti: prima la scala (dalla più facile), poi le alternative.
export function variantiDi(es) {
  return [
    ...(es.varianti || []).map((v) => ({ ...v, scala: true })),
    ...(es.alternative || []).map((v) => ({ ...v, scala: false })),
  ];
}

export function limiti(es, varianteId) {
  const v = variantiDi(es).find((x) => x.id === varianteId);
  return { min: v?.min ?? es.min, max: v?.max ?? es.max };
}

export function varianteIniziale(es, ultima, haElastici) {
  const tutte = variantiDi(es);
  if (ultima && tutte.some((v) => v.id === ultima.varianteId)) return ultima.varianteId;
  if (es.elastico && !haElastici && es.alternative?.length) return es.alternative[0].id;
  return tutte[0].id;
}

// ---------- Storico ----------

function ordinaRecenti(allenamenti) {
  return [...allenamenti].sort((a, b) =>
    a.data === b.data ? (b.creato || '').localeCompare(a.creato || '') : b.data.localeCompare(a.data));
}

// L'ultima volta che l'esercizio è stato fatto davvero (non saltato, almeno una serie).
export function ultimaVolta(allenamenti, esId, escludiId) {
  for (const a of ordinaRecenti(allenamenti)) {
    if (a.id === escludiId) continue;
    const e = (a.esercizi || []).find((x) => x.id === esId);
    if (e && !e.saltato && e.serie && e.serie.filter((v) => v != null).length) {
      return { data: a.data, modalita: a.modalita, varianteId: e.varianteId, variante: e.variante,
        serie: e.serie.filter((v) => v != null) };
    }
  }
  return null;
}

// Doppia progressione: se l'ultima volta (in una settimana normale) tutte le serie
// sono arrivate al massimo, suggerisce la variante successiva della scala.
export function suggerimento(es, ultima) {
  if (!ultima || es.progressione === false || ultima.modalita !== 'normale') return null;
  const scala = es.varianti || [];
  const i = scala.findIndex((v) => v.id === ultima.varianteId);
  if (i < 0 || i === scala.length - 1) return null;
  const { max } = limiti(es, ultima.varianteId);
  if (ultima.serie.length && ultima.serie.every((v) => v >= max)) return scala[i + 1];
  return null;
}

// Il valore da proporre per la serie k (1-based): quello dell'ultima volta, o il minimo.
export function valoreProposto(es, varianteId, ultima, k) {
  const { min } = limiti(es, varianteId);
  if (!ultima || ultima.varianteId !== varianteId) return min;
  const s = ultima.serie;
  return s[k - 1] ?? s[s.length - 1] ?? min;
}

export function allenamentiSettimana(allenamenti, isoSett) {
  return allenamenti.filter((a) => settimanaISO(a.data) === isoSett);
}

export function riassuntoSettimana(allenamenti, isoSett) {
  const lista = allenamentiSettimana(allenamenti, isoSett);
  const fatti = new Set(lista.map((a) => a.giornata));
  return {
    fatti,
    dieci: lista.filter((a) => a.modalita === 'dieci').length,
    totale: lista.length,
  };
}

// Quale giornata proporre oggi. Regola: se il lunedì è saltato, il mercoledì si fa la Forza.
export function giornataConsigliata(scheda, allenamenti, oggi) {
  const dow = giornoSettimana(oggi);
  const { fatti } = riassuntoSettimana(allenamenti, settimanaISO(oggi));
  if (dow === 3 && !fatti.has('forza') && !fatti.has('atleta')) {
    return { id: 'forza', motivo: 'Lunedì è saltato: oggi fai la scheda del lunedì (regola del programma).' };
  }
  const g = scheda.giornate.find((x) => x.giorno === dow);
  if (g) return { id: g.id, motivo: null };
  if (dow === scheda.corsa.giorno) return { id: 'corsa', motivo: null };
  return { id: null, motivo: dow === 2 ? 'Oggi riposo.' : 'Oggi c\'è tennis.' };
}

// ---------- Passi di un allenamento guidato ----------

export function costruisciPassi(scheda, giornataId, { settimana, modalita, daCarta, conTest }) {
  const passi = [];
  if (giornataId === 'corsa') {
    if (conTest) for (const t of scheda.test.corsa || []) passi.push({ tipo: 'test', chiave: t.chiave });
    else passi.push({ tipo: 'corsa' });
    passi.push({ tipo: 'fine' });
    return passi;
  }
  const g = trovaGiornata(scheda, giornataId);

  if (modalita === 'dieci') {
    if (!daCarta) passi.push({ tipo: 'lista', quale: 'riscaldamentoBreve' });
    const ids = g.dieciMinuti;
    for (let r = 1; r <= 2; r++) {
      for (const id of ids) passi.push({ tipo: 'serie', es: id, serie: r, di: 2 });
    }
    passi.push({ tipo: 'fine' });
    return passi;
  }

  if (!daCarta) passi.push({ tipo: 'lista', quale: 'riscaldamento' });
  if (conTest) for (const t of scheda.test[giornataId] || []) passi.push({ tipo: 'test', chiave: t.chiave });
  for (const b of g.blocchi) {
    const giri = b.esercizi.map((e) => giriPer(scheda, settimana, modalita, e));
    const massimo = Math.max(...giri);
    for (let r = 1; r <= massimo; r++) {
      b.esercizi.forEach((e, i) => {
        if (r <= giri[i]) passi.push({ tipo: 'serie', es: e.id, serie: r, di: giri[i], facoltativo: !!b.facoltativo });
      });
    }
  }
  if (g.mobilita) passi.push({ tipo: 'lista', quale: 'mobilita' });
  if (!daCarta) passi.push({ tipo: 'lista', quale: 'defaticamento' });
  passi.push({ tipo: 'fine' });
  return passi;
}

export function definizioneTest(scheda, chiave) {
  for (const lista of Object.values(scheda.test)) {
    const t = lista.find((x) => x.chiave === chiave);
    if (t) return t;
  }
  return null;
}

// Tempo in secondi -> "m:ss"
export function mmss(sec) {
  if (sec == null || isNaN(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
