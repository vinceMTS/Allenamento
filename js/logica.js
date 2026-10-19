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

// ---------- Tornei ----------
// Regola del programma: nei 2 giorni prima della prima partita ("vigilia") niente Forza,
// Atleta e corsa, al massimo Spalle e core leggero. Durante il torneo niente allenamenti
// a casa. Dopo: 1-2 giorni tranquilli ("dopo" 1 e 2), poi si riprende dal calendario.

export const GIORNI_VIGILIA = 2;
export const GIORNI_DOPO = 2;

// Il torneo che riguarda la data: quello in corso o il prossimo (null se nessuno).
export function torneoDi(tornei, data) {
  const attivi = (tornei || [])
    .filter((t) => t.inizio && aggiungiGiorni(t.fine || t.inizio, GIORNI_DOPO) >= data)
    .sort((a, b) => a.inizio.localeCompare(b.inizio));
  return attivi[0] || null;
}

// Fase della data rispetto al torneo: "prima", "vigilia", "torneo", "dopo" (oppure null).
export function faseTorneo(tornei, data) {
  const t = torneoDi(tornei, data);
  if (!t) return null;
  const fine = t.fine || t.inizio;
  const mancano = giorniTra(data, t.inizio);
  if (mancano > GIORNI_VIGILIA) return { torneo: t, fase: 'prima', mancano };
  if (mancano > 0) return { torneo: t, fase: 'vigilia', mancano };
  if (data <= fine) {
    return { torneo: t, fase: 'torneo', giorno: giorniTra(t.inizio, data) + 1, totale: giorniTra(t.inizio, fine) + 1 };
  }
  return { torneo: t, fase: 'dopo', giorno: giorniTra(fine, data) };
}

// Giornate da non fare in quella data per via del torneo.
export function bloccataDalTorneo(tornei, data, giornataId) {
  const f = faseTorneo(tornei, data);
  if (!f) return false;
  if (f.fase === 'torneo' || (f.fase === 'dopo' && f.giorno === 1)) return true;
  return f.fase === 'vigilia' && giornataId !== 'spalle';
}

// Lunedì giusto per far partire il ciclo dopo il torneo: almeno 2 giorni dopo l'ultima partita.
export function lunediDopoTorneo(t) {
  const d = aggiungiGiorni(t.fine || t.inizio, GIORNI_DOPO);
  return giornoSettimana(d) === 1 ? d : aggiungiGiorni(lunediDi(d), 7);
}

// Vero se i giorni toccati dal torneo (vigilia, partite, primo giorno dopo) cadono
// nella settimana 1 del ciclo, quella dei test.
export function torneoNeiTest(t, inizioCiclo) {
  if (!t || !inizioCiclo) return false;
  const lun = lunediDi(inizioCiclo);
  const da = aggiungiGiorni(t.inizio, -GIORNI_VIGILIA);
  const a = aggiungiGiorni(t.fine || t.inizio, 1);
  return da <= aggiungiGiorni(lun, 6) && a >= lun;
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

// Quale giornata proporre oggi. Regola: se il lunedì è saltato, il mercoledì si fa la Forza
// (ma non se il lunedì era bloccato dal torneo: dopo il torneo si riprende dal calendario).
// Poi si applica la regola dei tornei.
export function giornataConsigliata(scheda, allenamenti, oggi, tornei = []) {
  const dow = giornoSettimana(oggi);
  const f = faseTorneo(tornei, oggi);
  if (f?.fase === 'torneo') return { id: null, torneo: true, motivo: 'Torneo in corso: oggi niente allenamenti a casa.' };
  if (f?.fase === 'dopo' && f.giorno === 1) return { id: null, torneo: true, motivo: 'Giorno tranquillo dopo il torneo.' };

  const { fatti } = riassuntoSettimana(allenamenti, settimanaISO(oggi));
  let id = null;
  let motivo = null;
  if (dow === 3 && !fatti.has('forza') && !fatti.has('atleta') && !bloccataDalTorneo(tornei, lunediDi(oggi), 'forza')) {
    id = 'forza';
    motivo = 'Lunedì è saltato: oggi fai la scheda del lunedì (regola del programma).';
  } else {
    id = scheda.giornate.find((x) => x.giorno === dow)?.id ?? (dow === scheda.corsa.giorno ? 'corsa' : null);
  }
  if (!id) return { id: null, motivo: dow === 2 ? 'Oggi riposo.' : 'Oggi c\'è tennis.' };

  if (f?.fase === 'vigilia' && id !== 'spalle') {
    const quando = f.mancano === 1 ? 'Domani inizia il torneo' : `Mancano ${f.mancano} giorni al torneo`;
    return { id: null, torneo: true, alternativa: 'spalle',
      motivo: `${quando}: oggi niente ${trovaGiornata(scheda, id).nome}.` };
  }
  if (f?.fase === 'vigilia') motivo = 'Vigilia del torneo: versione leggera (2 giri, 3-4 in riserva). Se preferisci, riposa.';
  if (f?.fase === 'dopo') motivo = 'Secondo giorno dopo il torneo: riprendi solo se ti senti fresco, se no riposa ancora.';
  return { id, motivo };
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
