# BINGO – Tombola per Windows, Mac e Android

## 1. Mettere il progetto su GitHub (una volta sola)
1. Su GitHub crea un nuovo repository chiamato **BINGO** (privato va bene).
2. Clicca **"uploading an existing file"** e trascina **tutto il contenuto** di questa cartella
   (comprese le cartelle `www`, `electron`, `build`, `assets` e la cartella nascosta `.github`).
   Se la cartella `.github` non si vede: in Esplora file attiva *Visualizza > Elementi nascosti*.
3. Premi **Commit changes**. Parte da solo il lavoro "Build BINGO" (scheda **Actions**): dura 10-15 minuti.
4. Finito, in **Releases** trovi:
   - `BINGO-Setup-1.0.0.exe` → Windows con installazione
   - `BINGO-Portatile-1.0.0.exe` → Windows senza installazione
   - `BINGO-Mac-1.0.0.dmg` → Mac
   - `BINGO-Android.apk` → telefono/tablet Android

Ogni nuova modifica caricata crea una nuova Release; restano sempre solo **le ultime 2**, le vecchie si cancellano da sole.

## 2. Installare
- **Windows**: se compare "Windows ha protetto il PC" → *Ulteriori informazioni* → *Esegui comunque*.
- **Mac**: apri il .dmg e trascina BINGO in Applicazioni. Al primo avvio: tasto destro sull'icona → *Apri* → *Apri*
  (oppure Impostazioni di Sistema → Privacy e sicurezza → *Apri comunque*).
- **Android**: apri l'APK e consenti "Installa app sconosciute". Gli aggiornamenti si installano sopra senza perdere i giocatori memorizzati.

## 3. Voce
L'app usa le voci italiane già presenti nel dispositivo:
- Windows: di solito c'è **Elsa** (femminile). Per altre voci: Impostazioni → Ora e lingua → Voce → Aggiungi voci → Italiano.
- Mac: **Alice** (femminile) e **Luca** (maschile); si scaricano da Impostazioni → Accessibilità → Contenuti letti ad alta voce.
- Android: "Sintesi vocale Google" con lingua italiana.
Se manca la voce del tipo scelto, l'app usa un'altra voce italiana cambiandone il tono.

## 4. Come si gioca
1. **Voce e velocità** (1-5 secondi tra un numero e l'altro).
2. **Giocatori**: scrivi il nome e premi INVIO. I giocatori già conosciuti ritrovano le loro cartelle preferite.
   "Completa elenco" aggiunge giocatori numerati fino al numero scelto (max 2000, max 6 cartelle ciascuno).
   "Giocatori dell'ultima partita" ricarica l'elenco precedente.
3. **Tipo di gioco**: In crescendo (tutti) oppure solo i premi spuntati.
4. **Premi**: prezzo per cartella (o montepremi fisso) → ripartizione automatica crescente.
5. **Stampa** le cartelle (su Android si crea un PDF da stampare o condividere).
6. **INIZIA PARTITA** → **AVVIA**. Quando c'è una vincita l'estrazione si ferma, la voce dice premio, numero di cartella
   e nome; premi **RIPRENDI** per continuare. Con Tombola e Tombolone parte la musica di festa.
   Tasto **spazio** = pausa/riprendi (su PC).

Ogni numero di cartella ha sempre gli stessi numeri: la cartella n. 125 è uguale in ogni partita.
Le cartelle 1-6, 7-12, 13-18… formano serie complete che contengono tutti i 90 numeri.

## Provare sul PC senza installare
Apri `www/index.html` con Chrome o Edge.
