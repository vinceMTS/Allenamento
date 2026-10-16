# Allenamento

App web per allenarsi a casa a corpo libero, pensata per un tennista. Mostra la scheda del giorno un esercizio alla volta, con il timer delle pause, e registra serie, varianti, voto e note. Funziona anche senza internet e si installa sulla schermata Home del telefono.

**Indirizzo:** https://vincemts.github.io/Allenamento/

## Come è fatta

- `index.html`, `app.css`, `js/`: l'app (HTML e JavaScript semplici, senza strumenti di compilazione).
  - `js/logica.js`: le regole del programma (settimane del ciclo, giri, ultima volta, progressione).
  - `js/dati.js`: salvataggio sul telefono, esportazione e importazione.
  - `js/app.js`: schermate e allenamento guidato.
- `scheda.json`: **la scheda**. Quando il programma cambia si modifica solo questo file.
- `stampa.html`, `stampa.js`: la versione da stampare, generata da `scheda.json`.
- `sw.js`: fa funzionare l'app senza internet.

## Aggiornare

- **Solo la scheda:** modifica `scheda.json` (con una nuova `versione` e la frase `novita`) e pubblica. Il telefono la scarica alla prima apertura con internet.
- **Il codice:** dopo ogni modifica aumenta `VERSIONE` in `sw.js`, altrimenti il telefono continua a usare la copia salvata.

## Dati personali

I dati degli allenamenti restano solo sul telefono (memoria del browser). Qui c'è solo la scheda, che è pubblica.
