// Dati personali: restano solo sul telefono (localStorage). Esportazione e importazione.

const CHIAVE = 'allenamento-dati';
export const FORMATO = 1;

function vuoti() {
  return {
    formato: FORMATO,
    impostazioni: { inizioCiclo: null, elastici: false, suono: true, vibrazione: true },
    settimane: {},      // { "2026-S46": { mantenimento: true } }
    allenamenti: [],
    test: [],
    note: [],           // { id, data, creato, tipo: "nota" | "messaggio", testo }
    inCorso: null,
    ultimaEsportazione: null,
    schedaVista: null,
  };
}

export function carica() {
  try {
    const testo = localStorage.getItem(CHIAVE);
    if (!testo) return vuoti();
    const d = JSON.parse(testo);
    const base = vuoti();
    return { ...base, ...d, impostazioni: { ...base.impostazioni, ...(d.impostazioni || {}) } };
  } catch (e) {
    console.error(e);
    return vuoti();
  }
}

export function salva(dati) {
  localStorage.setItem(CHIAVE, JSON.stringify(dati));
}

export function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Chiede al browser di non cancellare i dati quando lo spazio scarseggia.
export async function chiediPersistenza() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  } catch {
    return false;
  }
}

// ---------- Esportazione ----------

export function contenutoEsportazione(dati, versioneApp, versioneScheda) {
  const { inCorso, ...resto } = dati;
  return {
    app: 'allenamento',
    versioneApp,
    versioneScheda,
    esportato: new Date().toISOString(),
    ...resto,
  };
}

export async function esporta(dati, versioneApp, versioneScheda, oggi) {
  const contenuto = contenutoEsportazione(dati, versioneApp, versioneScheda);
  const nome = `allenamento-${oggi}.json`;
  const blob = new Blob([JSON.stringify(contenuto, null, 2)], { type: 'application/json' });
  const file = new File([blob], nome, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome });
      return 'condiviso';
    } catch (e) {
      if (e.name === 'AbortError') return 'annullato';
      // altrimenti si prova con lo scaricamento
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'scaricato';
}

// Unisce un file esportato ai dati attuali senza perdere nulla: i record si riconoscono dall'id.
export function unisci(dati, importati) {
  if (!importati || importati.app !== 'allenamento') throw new Error('Il file non viene da questa app.');
  const perId = (attuali, nuovi) => {
    const mappa = new Map((attuali || []).map((x) => [x.id, x]));
    for (const x of nuovi || []) if (!mappa.has(x.id)) mappa.set(x.id, x);
    return [...mappa.values()];
  };
  const prima = dati.allenamenti.length + dati.test.length + dati.note.length;
  const risultato = {
    ...dati,
    impostazioni: { ...(importati.impostazioni || {}), ...pulite(dati.impostazioni) },
    settimane: { ...(importati.settimane || {}), ...dati.settimane },
    allenamenti: perId(dati.allenamenti, importati.allenamenti),
    test: perId(dati.test, importati.test),
    note: perId(dati.note, importati.note),
  };
  const dopo = risultato.allenamenti.length + risultato.test.length + risultato.note.length;
  return { dati: risultato, aggiunti: dopo - prima };
}

function pulite(imp) {
  return Object.fromEntries(Object.entries(imp || {}).filter(([, v]) => v != null));
}
