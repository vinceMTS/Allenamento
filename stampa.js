// Versione da stampare della scheda, generata da scheda.json (la stessa che usa l'app).
(async function () {
  const el = document.getElementById('contenuto');
  let s;
  try {
    s = await (await fetch('scheda.json', { cache: 'no-cache' })).json();
  } catch {
    el.textContent = 'Non riesco a caricare la scheda.';
    return;
  }
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lato = (e) => (e.perLato ? ` ${e.unitaLato || (e.tipo === 'tempo' ? 'per lato' : 'per gamba')}` : '');
  const quantita = (e) => {
    const giri = e.giriMax ? `${e.giriMax}` : '2-3';
    const interv = e.min === e.max ? `${e.min}` : `${e.min}-${e.max}`;
    return `${giri} × ${interv}${e.tipo === 'tempo' ? ' s' : ''}${lato(e)}`;
  };
  const lista = (b) => `<p><b>${esc(b.titolo)}</b> (${esc(b.durata)}): ${b.voci.map(esc).join(' · ')}${b.nota ? `. <i>${esc(b.nota)}</i>` : ''}</p>`;
  const nomeDi = (g, id) => [...g.blocchi.flatMap((b) => b.esercizi), ...(g.eserciziExtra || [])].find((e) => e.id === id).nome;

  const giornate = s.giornate.map((g) => `
    <h2>${esc(['', 'Lunedì', '', 'Mercoledì', '', 'Venerdì'][g.giorno])}: ${esc(g.nome)} <span class="how">(${esc(g.durata)} · ${esc(g.riserva)} ripetizioni in riserva)</span></h2>
    <table><tr><th>Coppia</th><th>Esercizio</th><th>Giri × ripetizioni</th><th>Varianti (dalla più facile)</th></tr>
    ${g.blocchi.flatMap((b) => b.esercizi.map((e) => `<tr><td>${esc(e.etichetta)}</td><td><b>${esc(e.nome)}</b>${e.nota ? `<div class="how">${esc(e.nota)}</div>` : ''}</td>
      <td class="qty">${quantita(e)}</td>
      <td>${(e.varianti || []).map((v) => esc(v.nome)).join(' → ')}${e.alternative?.length ? `<div class="how">${e.elastico ? 'Senza elastici' : 'Alternative'}: ${e.alternative.map((v) => esc(v.nome)).join(' · ')}</div>` : ''}</td></tr>`)).join('')}
    </table>
    ${g.mobilita ? lista(g.mobilita) : ''}
    <p class="how"><b>10 minuti:</b> ${g.dieciMinuti.map((id) => esc(nomeDi(g, id))).join(' · ')} (2 giri). <b>Perché:</b> ${esc(g.perche)}</p>`).join('');

  const corsa = Object.entries(s.corsa.settimane).map(([n, v]) => `<tr><td>${n}</td><td>${esc(v.testo)}</td></tr>`).join('');
  const test = [['Lunedì', 'forza'], ['Mercoledì', 'atleta'], ['Venerdì', 'spalle'], ['Domenica', 'corsa']]
    .map(([d, k]) => `<tr><td>${d}</td><td>${s.test[k].map((t) => esc(t.nome)).join(' · ')}</td></tr>`).join('');
  const regole = s.regole.map((r) => `<p><b>${esc(r.titolo)}.</b> ${r.testo.map(esc).join(' ')}</p>`).join('');

  const settimane = Array.from({ length: s.settimaneCiclo }, (_, i) => i + 1);
  const registro = s.giornate.map((g) => `
    <h2>Registro: ${esc(g.nome)}</h2>
    <table class="reg"><tr><th class="n">Esercizio</th>${settimane.map((n) => `<th>Sett. ${n}<br><span class="how">variante e ripetizioni</span></th>`).join('')}</tr>
    ${g.blocchi.flatMap((b) => b.esercizi).map((e) => `<tr><td class="n">${esc(e.etichetta)} ${esc(e.nome)}</td>${settimane.map(() => '<td></td>').join('')}</tr>`).join('')}
    <tr><td class="n">Data · voto 1-5 · note</td>${settimane.map(() => '<td></td>').join('')}</tr></table>`).join('');

  el.innerHTML = `
    <h1>${esc(s.titolo)}: la scheda</h1>
    <p class="sub">Aggiornata il ${esc(s.aggiornata)} · ${s.settimaneCiclo} settimane · nella settimana 1 i test.</p>
    <table><tr><th>Lun</th><th>Mar</th><th>Mer</th><th>Gio</th><th>Ven</th><th>Sab</th><th>Dom</th></tr>
    <tr><td><b>Forza</b></td><td>riposo</td><td><b>Atleta</b></td><td>tennis</td><td><b>Spalle e core</b></td><td>tennis</td><td><b>Corsa</b></td></tr></table>
    <p class="how">Giri: settimane 1-2 → 2 giri, dalla settimana 3 → 3 giri. Coppie: A1, pausa 45 s, A2, pausa 45 s, e si ricomincia.</p>
    ${lista(s.riscaldamento)}${lista(s.defaticamento)}
    ${giornate}
    <h2>Domenica: corsa</h2><table><tr><th>Sett.</th><th>Cosa fare</th></tr>${corsa}<tr><td>Mant.</td><td>${esc(s.corsa.mantenimento.testo)}</td></tr></table>
    <p class="how">${esc(s.corsa.allungo)} ${esc(s.corsa.inverno)}</p>
    <h2>Settimana dei test</h2><table>${test}</table>
    <div class="salto"></div><h2>Le regole</h2>${regole}
    <div class="salto"></div>${registro}
    <p class="how">Corsa: segna i minuti (e i km, se li sai) nelle note della giornata più vicina, oppure direttamente nell'app.</p>`;
})();
