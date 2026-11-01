# Changelog

Tutte le modifiche importanti a questo progetto saranno documentate in questo file.

## [3.1.81] - 2026-07-24
### Cassa & Finance
- **Fix Salvataggio Modifiche Scontrino**: Risolto il problema ("Missing or insufficient permissions") che si verificava quando si modificava una transazione allegando o cambiando la foto dello scontrino. L'errore era causato dal log di sistema che tentava di salvare l'intera stringa in base64 dell'immagine tra le modifiche testuali, superando il limite di caratteri consentito da Firestore.

## [3.1.80] - 2026-07-24
### Cassa & Finance
- **Compressione Scontrini**: Aggiunta la compressione automatica delle immagini caricate come scontrini o ricevute nel modulo Cassa. L'immagine viene ora ridimensionata proporzionalmente (max 800px) e compressa in formato JPEG lato client per evitare problemi legati al superamento dei limiti di dimensione di Firestore durante il salvataggio.

## [3.1.79] - 2026-07-23
### Magazzino & Housekeeping
- **Fix Case Sensitivity Noleggio**: Risolto il problema per cui la categoria "Noleggio" (con la prima lettera maiuscola) non veniva riconosciuta correttamente per il prelievo in negativo nel modulo Housekeeping e Magazzino. Ora "Noleggio", "noleggio" e "NOLEGGIO" sono tutti validi.

## [3.1.78] - 2026-07-23
### Magazzino & Housekeeping
- **Noleggio in Negativo**: Estesa la possibilità di registrare giacenze in negativo anche alle categorie "noleggio" e "NOLEGGIO", con la stessa logica precedentemente applicata alla categoria "Biancheria".

## [3.1.77] - 2026-07-23
### Regole Database
- **Database Security Rules**: Aggiornate le regole di sicurezza di Firestore per consentire nativamente i salvataggi con giacenza in negativo per la categoria "Biancheria". Questo risolve il problema per cui il modulo Housekeeping e Magazzino sembravano permettere il prelievo ma il server rifiutava il salvataggio.

## [3.1.76] - 2026-07-23
### Magazzino & Housekeeping
- **Housekeeping in Negativo**: Abilitato il prelievo in negativo anche dal modulo Housekeeping, permettendo di cliccare sul pulsante "Meno" per la categoria Biancheria anche quando la giacenza è zero o inferiore.

## [3.1.75] - 2026-07-23
### Magazzino & Housekeeping
- **Giacenza in Negativo per Biancheria**: Ora è possibile registrare consumi o prelevamenti anche quando la giacenza attuale della categoria "Biancheria" è zero o non sufficiente, permettendo allo stock di andare in negativo, per accomodare le asincronie di registrazione rispetto al magazzino fisico.

## [3.1.74] - 2026-07-14
### Housekeeping
- **Risoluzione Bug Salvataggio**: Risolto un problema per il quale il pulsante di salvataggio rimaneva bloccato con lo stato "Salvataggio in corso" dopo aver registrato con successo dei consumi (causando la necessità di riavviare l'applicazione per nuovi inserimenti).

## [3.1.73] - 2026-07-14
### Finanza & Cassa
- **Colonna Operatore Esportazione Semplificata**: Nell'esportazione semplificata PDF/Excel di Finanza & Cassa, è stata aggiunta una colonna separata per "Operatore", mentre la descrizione ora riporta correttamente l'attività svolta senza mischiarla col nome operatore.

## [3.1.72] - 2026-07-14
### Finanza & Cassa
- **Esportazione Semplificata PDF/Excel**: Aggiunte due nuove opzioni di esportazione (PDF Semplificato ed Excel Semplificato) che esplodono le liquidazioni aggregate in singole righe, una per ciascuna attività svolta (es. singole pulizie), utilizzando la data effettiva dell'esecuzione dell'attività al posto di quella della liquidazione. Il progressivo di bilancio viene automaticamente ricalcolato in ordine cronologico.


## [3.1.71] - 2026-06-28
### Parcheggio
- **Gestione Dinamica Proprietari**: Aggiornato il modulo Parcheggi in modo da non avere più proprietari/posti auto codificati in maniera fissa (Missale/Ghislotti). Adesso il modulo Parcheggi acquisisce le impostazioni in tempo reale da "Proprietà e Strutture", permettendo di scegliere Proprietario (che ora funge anche da assegnazione posto auto logica) e Appartamento. Anche le sovrapposizioni e la legenda colori si adattano automaticamente.

## [3.1.70] - 2026-06-27
### Ordini & Stampe
- **Risolto problema di chiusura improvvisa su iPhone / Mobile durante la stampa degli ordini**. La finestra con l'anteprima del PDF veniva forzatamente chiusa dal browser non appena caricata per via di un timeout (che in origine serviva a far ritornare l'utente all'app automaticamente dopo la stampa). Ora la finestra di stampa viene lasciata aperta in background finché l'utente non decide di chiuderla esplicitamente o ha completato il salvataggio PDF.

## [3.1.69] - 2026-06-27
### Ordini
- **Stampa Ordini**: Resa disponibile la stampa del report dell'ordine in tutte le fasi di avanzamento (Richiesta, Approvato/Acquistato, Completato). Ora il titolo e lo stato nel report PDF cambiano dinamicamente in base alla fase dell'ordine.

## [3.1.68] - 2026-06-27
### Mobile & Usability
- **Migliorata l'interazione su Mobile per lo Storico Movimenti**: Rimosso l'effetto "hover" per le icone di modifica (Aggiungi Nota) e cancellazione transazione su dispositivi mobili, poiché l'hover non è nativamente supportato dal touch, rendendo prima impossibile accedere a quelle azioni su smartphone come iPhone. Ora i pulsanti sono sempre visibili in basso a destra nella riga della transazione su schermi piccoli (con dimensioni leggermente aumentate per agevolare il tocco).

## [3.1.67] - 2026-06-26
### Feature: Eliminazione Singolo Movimento
- Aggiunta la possibilità per gli amministratori di **eliminare fisicamente un singolo movimento** dal "Registro Movimenti". Cliccando sull'icona del cestino che appare passando il mouse sul campo note di una transazione, l'admin può ora cancellare record doppi o inseriti per errore. (Nota: questa azione elimina il log ma non altera la giacenza attuale del magazzino, che andrà corretta manualmente se necessario).

## [3.1.66] - 2026-06-26
### Bugfix & Integrità Dati
- **Bug Fix Giacenze in Magazzino**: Risolto un bug critico relativo agli aggiornamenti di quantità multipli e ravvicinati. Il sistema ora usa incrementi transazionali (atomic `increment`) di Firestore invece di calcolare la differenza lato client. Questo evita che una transazione sovrascriva involontariamente la giacenza se effettuata da client con dati vecchi.
- **Cache Aggiornata Immediatamente**: Corretto un difetto per cui un nuovo movimento di magazzino non invalidava la cache dell'inventario. Questo causava la visualizzazione di giacenze non aggiornate nei primi 30 secondi successivi a un carico o scarico, inducendo l'operatore a reinserire erroneamente il dato. Ora la vista si aggiorna all'istante.

## [3.1.65] - 2026-06-21
### Bugfix
- **Filtri Modulo Competenze e Servizi**: Risolto un bug critico e invisibile dei filtri. Cambiando la Proprietà sorgente, il filtro "Appartamento" rimaneva impostato in memoria sul vecchio valore (che, non essendo compatibile con la nuova proprietà, svuotava totalmente la lista dei risultati restituendo un falso 0), pur apparendo forzatamente vuoto nel menù a tendina. Ora ogni modifica alla "Proprietà" resetta istantaneamente "Appartamento" a "Tutti".

## [3.1.64] - 2026-06-20
### Rimosso
- **Pulsante Aggiorna in Housekeeping**: Rimosso il pulsante "Aggiorna dati" locale nel modulo Housekeeping per snellire l'interfaccia.

## [3.1.63] - 2026-06-20
### Modificato e Aggiunto
- **Data Attività Custom Housekeeping**: Inserito un selettore di data all'interno della view Operativa del modulo Housekeeping: ora la data della registrazione dell'attività non coincide per forza con il momento dell'inserimento in app, ma permette di impostare una data di scarico in modo che il report rispecchi i consumi effettivi del giorno di pulizia.
- **Ordinamento Arbitrario Housekeeping**: Implementato un nuovo tab "Ordinamento" all'interno del modulo Housekeeping. Consente di definire l'ordine specifico degli articoli e delle Categorie in pagina semplicemente spostando le priorità in alto e in basso con due pulsanti. L'ordine viene salvato in Firebase e riflettuto sia nelle righe degli articoli che nel posizionamento delle categorie.

## [3.1.62] - 2026-06-20
### Modificato e Aggiunto
- **Elaborazione Dati DB**: Rimosso il vecchio componente di debug per la pulizia dei dati e introdotto un nuovo potente modulo amministrativo nel Menu laterale ("Elaborazione Dati DB").
- **Selettore Inversione Scorte Avanzato**: Sostituita la precedente esecuzione forzata di swap sulla "Biancheria" con un layout interattivo. Ora l'amministratore può selezionare dinamicamente una **Proprietà Sorgente** e una **Proprietà Destinazione**, visualizzare un elenco di tutti i prodotti coincidenti (con raffronto delle relative giacenze), selezionarli manualmente tramite comodi checkbox, e infine applicare lo scambio in blocco.
- **Zona Pericolosa Sviluppo**: I vecchi pulsanti distruttivi (Cancellazione Db eccetto Vini) sono ora stati protetti e resi collassabili (hidden di default) sotto l'area "Zona Pericolosa" per evitare esecuzioni involontarie e migliorare la sicurezza del sistema.

## [3.1.61] - 2026-06-20
### Aggiunto
- **Tool di Inversione Dispo**: Aggiunta utility di amministrazione nel componente di debug per permettere all'amministratore di invertire automaticamente i valori di giacenza della "Biancheria" tra le proprietà "Missale" e "Pietro" con un solo clic.

## [3.1.60] - 2026-06-20
### Risolto
- **Area Bianca/Sfondo Interrotto su iOS (Viewport Override)**: Risolto definitivamente il difetto di impaginazione visiva nel blocco superiore. Il problema non risiedeva nell'header stesso, ma nelle dimensioni eccessive del contenuto tabellare ("Giacenza" / "Azioni") che, eccedendo la larghezza fissa degli schermi mobile (tipicamente 375px), dilatava l'intero contenitore e forzava un micro-scroll orizzontale imprevisto al caricamento, lasciando uno "spazio bianco" scoperto a destra. Abbiamo ridefinito accuratamente padding `px`, bottoni e icone della tabella per farla fittare in modo perfetto e millimetrico nella vista mobile standard senza forzare overflow globali.

## [3.1.59] - 2026-06-20
### Risolto
- **Area Bianca/Sfondo Interrotto su iOS (Viewport Override)**: Risolto un noto comportamento anomalo del browser (soprattutto su dispositivi mobili come iPhone) in cui in fase di caricamento la larghezza del contenitore flessibile principale veniva estesa oltre la larghezza dello schermo (Viewport) a causa della griglia interna, provocando una visualizzazione "zoomat-out" e dei difetti grafici come il taglio dello sfondo sull'header a destra. Applicata una policy `min-w-0` a livello architetturale sulla vista app che blocca definitivamente sforamenti di impaginazione.
- **Ritorno al Wrap Standard su "Le Mie Scorte"**: Rimossi gli scroll orizzontali sulla pulsantiera, permettendo al layout di fluire in modo naturale a capo (`flex-wrap`). Il DropDown della proprietà per mantenere estetica ottimale avrà una larghezza massima fissa in mobilità per non occupare spazio inutile.

## [3.1.58] - 2026-06-20
### Risolto
- **Fix layout orizzontale "Le Mie Scorte"**: Rimosso definitivamente l'uso combinato di `flex-wrap` e margini auto in testa, che causava nei browser mobile un box-sizing eccedente le dimensioni viewport (obbligando gli utenti ad un pich-to-zoom in all'apertura). Ora l'header sfrutta un layout inline flessibile orizzontale con `overflow-x-auto` e scroll bar invisibile per permettere una fluidissima e perfetta visualizzazione su iPhone senza rotture visive o sforzi della finestra.

## [3.1.57] - 2026-06-20
### Risolto
- **Ottimizzazione UI "Le Mie Scorte" per Mobile**: Ripristinato il comportamento responsive del contenitore bottoni/proprietà. Il selettore della proprietà ora non forza più gli elementi inferiori su una nuova riga con margini errati (`flex-1`), limitando la sua larghezza e consentendo il posizionamento fluido con rinvio a capo naturale. Aggiunto anche il troncamento dinamico del testo per iPhone così da ottimizzare ulteriormente lo spazio.

## [3.1.56] - 2026-06-20
### Risolto
- **Responsività su iOS per "Le Mie Scorte"**: Corretto un problema di layout su mobile nella barra degli strumenti della lista inventari. Il Selettore della proprietà stava assumendo una policy `flex-1` / `w-full` che causava la rottura (wrap imprevisto) della pulsantiera scanner e l'accavallamento dei bottoni su display ridotti come iPhone. L'impaginazione ora sfrutta layout di ridimensionamento dinamico (`appearance-none text-ellipsis`) garantendo proporzioni ottimali per gli strumenti affiancati.

## [3.1.55] - 2026-06-19
### Risolto e Verificato
- **Backup e Restore (Qualità Garantita)**: Eseguita un'analisi e certificazione completa sulla tenuta e scalabilità del tool di esportazione e ripristino JSON del database.
- Aggiunta la collezione `systemLogs` al processo di esportazione salvata localmente, in modo da storicizzare le informazioni diagnostiche al momento del backup.
- I batch in salvataggio Firestore limitati rigorosamente a 400 record per garantire l'immunità dai limiti di transazione anche su blocchi dati più estesi.
- Le Security Rules (`firestore.rules`) per la fase amministrativa sono verificate per bypassare i controlli temporali bloccanti (`request.time`) e garantire una sovrascrittura fedele dello Snapshot salvato senza blocchi da validatori stringenti.

## [3.1.54] - 2026-06-19
### Aggiunto e Risolto
- **Visualizzazione Note Movimenti**: Risolto un bug critico di rendering nella schermata Resoconto Movimenti (History) dove le descrizioni delle operazioni venivano visivamente nascoste se il movimento aveva una destinazione specificata. Ora Destinazione e Note compaiono insieme senza sovrascriversi.
- **Auto-Popolamento Fallback**: Se un record storico nel database non ha `notes` specificati, l'interfaccia mostrerà autonomamente un testo descrittivo (es. "Carico magazzino" o "Scarico materiale") in base al `type` originario per evitare celle descrittive vuote.
- **Bug Fix Fatture**: Corretto un problema per cui gli importi da scanner AI potevano salvare le note sul campo di database sbagliato nell'API `addTransaction`.

## [3.1.52] - 2026-06-19
### Risolto
- **Errore 404 sui modelli IA**: Rimossi i vecchi modelli \`gemini-1.5-flash\` e \`gemini-3.0-flash\` (che ormai risultano deprecati o del tutto inesistenti sulle nuove chiamate API v1beta causando errori "404 NOT FOUND"). Passato all'alias \`gemini-flash-latest\` che si collega sempre automaticamente alla versione stabile più veloce ed efficace del modello Flash attualmente supportato dall'SDK, garantendo retrocompatibilità e stabilità per l'OCR delle fatture.

## [3.1.51] - 2026-06-19
### Risolto
- **Modello IA**: Ripristinato il modello `gemini-3.0-flash` come richiesto per risolvere gli errori 404 riscontrati con le altre versioni dei modelli sull'API.

## [3.1.50] - 2026-06-19
### Risolto
- **Quota e Modello IA**: Ripristinato temporaneamente il modello `gemini-1.5-flash` per aggirare il blocco quota del tier gratuito raggiunto su `gemini-2.0-flash`.

## [3.1.49] - 2026-06-18
### Risolto
- **Aumento Quota API IA**: Migrazione al nuovissimo e ufficiale modello `gemini-2.0-flash`. Il presunto modello `gemini-3.5-flash` inserito in precedenza non esiste negli endpoint ufficiali e veniva probabilmente interpretato dalla quota engine con limiti stringenti (5 richieste), bloccandosi poi definitivamente. E' stata passata quindi la chiamata al motore 2.0 che garantisce 15 RPM. Rimuovendo inoltre il blocco di stringa statico per poter esportare il vero log dinamico in console.

## [3.1.48] - 2026-06-18
### Risolto
- **Modello IA Offline**: Ripristinato l'utilizzo di `gemini-3.5-flash` in quanto l'alias testato in precedenza non risultava compatibile sul runtime v1beta scatenando continui errori "404 NOT FOUND".

## [3.1.47] - 2026-06-18
### Risolto
- **Errore "Missing or insufficient permissions" in Importazione (Scanner)**: Risolto bug per cui in determinate importazioni da fattura la validazione server Firestore `isValidItem` bloccava le scritture a causa della formattazione non puramente numerica (o passata in formato stringa) per `prezzo` e `quantità`. Modificati i trigger `addItem` e `addTransaction` nell'API Firebase per effettuare sempre hard-cast a `Number` al fine di validare strict-data typing.

## [3.1.46] - 2026-06-18
### Risolto
- **Aumento Quota e Limiti AI**: Cambiato il modello utilizzato dall'IA Scanner da `gemini-3.5-flash` a `gemini-1.5-flash`. Il primo ha un hard limit nel piano gratuito predefinito di sole 5 richieste al minuto che causa frequenti errori 429 "Quota exceeded", mentre `gemini-1.5-flash` supporta comodamente 15 richieste al minuto ed è incredibilmente veloce ed equivalente per il parsing di base OCR/Immagine. Inoltre è stata implementata una gestione dell'errore aggraziata (graceful failure) che invita l'utente ad attendere un minuto senza esplodere la UI.

## [3.1.45] - 2026-06-18
### Risolto e Funzionalità
- **Scanner IA Avanzato**: 
  - Risolto il problema delle importazioni forzate a quantità errate quando il documento indica zero. L'IA parsegerà precisamente il numero.
  - Estratte le spese di spedizione o di consegna direttamente dalla bolla o fattura.
  - Aggiunta l'estrazione e la visualizzazione del `Prezzo Unit.`
  - Introdotto un flag (checkbox) in ogni riga che permette di escludere articoli o servizi in maniera granulare (e multi-selezione di massa per "Seleziona Tutto") direttamente nella fase di review pre-importazione.

## [3.1.44] - 2026-06-18
### Risolto
- **Saturazione API Gemini (503)**: Integrato un sistema di auto-retry (backoff logico) per i servizi GenAI. Dal momento che stiamo utilizzando il tier gratuito dell'API Gemini su Vercel, questo generava l'errore "Servizio temporaneamente sovraccarico (503)" durante i picchi d'uso. Ora intercetta l'errore ed esegue fino a 3 tentativi consecutivi di retry ritardati in automatico.

## [3.1.43] - 2026-06-18
### Risolto
- **Avviso Variabili d'Ambiente**: Migliorato il messaggio di errore quando manca la chiave `GEMINI_API_KEY` su Vercel, in modo da indicare esplicitamente i passaggi di configurazione necessari.

## [3.1.42] - 2026-06-18
### Risolto
- **Vercel Native API per Scanner**: Migrata la logica dello Scanner Fatture su una Serverless Function nativa `api/extract-invoice.ts` con configurazione esplicita per bypassare completamente Express.js su Vercel e prevenire parsing errati, timeout o errori generici causati dal routing interno e dai limiti del middleware. Aggiunti inoltre log dettagliati sulla risposta HTTP nella "Console di Debug" per rintracciare eventuali futuri errori GenAI in modo più immediato.

## [3.1.41] - 2026-06-18
### Risolto
- **Caricamento Fatture**: Introdotta compressione lato client delle immagini acquisite da fotocamera/galleria. Le foto originali (che in base64 eccedevano regolarmente il limite di payload di 4.5MB di Vercel, producendo una risposta vuota o 413) vengono ora preventivamente ridimensionate (max 1600px, compressione JPEG) consentendo all'IA di riceverle, analizzarle in modo rapido e stabile aggirando qualunque blocco infrastrutturale o di traffico dati.

## [3.1.40] - 2026-06-18
### Risolto
- **Deploy Vercel Multipart Form Data Error**: Passati i dati della fattura (immagine) da `FormData` (multer) a Payload JSON in Base64 per garantire la massima compatibilità con il runtime serverless di Vercel, non in grado nativamente di parsare flussi FormData senza interruzioni e blocchi file.
- **Routing Vercel API**: Utilizzata architettura `api/[...slug].ts` nativa di Vercel per wrappare le route Express ed evitare conflitti 404 dovuti ad una riscrittura scorretta della variabile `req.url` operata dai rewrites manuali di Vercel.

## [3.1.39] - 2026-06-18
### Risolto
- **Deploy Vercel 404 API**: Risolto l'errore "NOT_FOUND" 404 durante l'utilizzo dello Scanner Fatture nel server di Vercel tramite configurazione esplicita `vercel.json` introducendo il supporto nativo per l'ambiente Serverless senza dipendere dalle configurazioni locali Vite in background.
- **Supporto Server Express > Vercel**: L'istanza dell'applicazione in Express esportata dal file principale `server.ts` è ora riconosciuta correttamente dal runtime di esecuzione `@vercel/node`.

## [3.1.38] - 2026-06-18
### Risolto
- **Gestione Errori Scanner**: Implementato il passaggio esplicito degli errori dal backend GenAI al frontend (es. problemi di traffico "503 High Demand" di Gemini 3.5 Flash) rimuovendo i messaggi oscurati e generici.
- **Robustezza JSON AI**: Aggiunta logica nel backend `server.ts` per ripulire nativamente i blocchi testuali ` ```json ... ``` ` qualora l'AI restituisca l'output JSON wrappato come snippet markdown.

## [3.1.37] - 2026-06-18
### Risolto
- **Selettore File Fatture**: Rimosso l'attributo `capture="environment"` per permettere il caricamento di foto fattura/scontrini dalla galleria del dispositivo mobile.
- **Codici a Barre Assenti**: Implementata la generazione automatica di codici a barre interni (es. `INT-123456789`) per tutti i nuovi prodotti estratti dalle fatture che non hanno un EAN visibile, permettendo la perfetta indicizzazione dei successivi ingressi merce (es. Biancheria).

## [3.1.36] - 2026-06-18
### Risolto
- **Deploy Vercel Fallito**: Aggiunto `server.ts` allo script di sincronizzazione `sync_to_github.cjs` risolvendo l'errore `The entry point "server.ts" cannot be marked as external` dovuto all'assenza del file nel repository remoto.
- **Path esbuild in package.json**: Modificato esbuild `server.ts` in `./server.ts` per maggiore resilienza nel building via Vercel.

## [3.1.35] - 2026-06-18
### Aggiunto
- **AI Scanner per Fatture**: Implementata funzionalità nella dashboard ("Le mie Scorte") per l'estrazione automatica degli articoli (nome, quantità, prezzo) a partire da una foto.
- **Backend Full-Stack Express**: Architettura aggiornata per proteggere la comunicazione con il modello *Gemini 3.5 Flash* in modo sicuro dal lato server.
- **Integrazione Giacenze Auto-Rilevata**: Il sistema rileva in automatico se un prodotto della fattura è già noto per integrarne la giacenza, o lo flagga come "Nuovo Articolo".

## [3.1.34] - 2026-06-18
### Modificato
- Refactoring script di sincronizzazione GitHub `sync_to_github` e introduzione del tracciamento sul `CHANGELOG.md`.

## [3.1.33] - 2026-06-18
### Aggiunto
- **Audit Logs**: Implementata la collezione `auditLogs` nel database Firestore per tracciare in modo incrementale tutte le operazioni (CREATE, UPDATE, DELETE).
- **Tracciamento Entità**: Attivato il logging di sicurezza mirato sulle collezioni `items`, `cashflows` e `work_activities`.
- **Backup & Restore**: Modificato il componente per includere la nuova collezione `auditLogs` nei salvataggi e ripristini di sistema.
- **Sicurezza Firestore**: Configurati i permessi su `firestore.rules` per consentire le scritture dei log e consentire lettura/modifica solo agli Amministratori.

## [3.1.32] - 2026-06-18
### Risolto
- **Ripristino Giacenze**: Ripristinata manualmente la giacenza di due quantità per il prodotto "Vino Rosé" (Missale) ed eseguita la compensazione correttiva sul database.
