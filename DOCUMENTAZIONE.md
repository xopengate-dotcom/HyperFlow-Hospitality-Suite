# Documentazione di Progetto: MagicPlace Warehouse

## 1. Panoramica del Sistema
MagicPlace Warehouse è una piattaforma gestionale web-based sviluppata in React e TypeScript, con backend e database basato su Firebase (Cloud Firestore).
Il sistema è progettato per gestire:
- L'**inventario** e il magazzino diviso per proprietà/strutture.
- Gli **ordini di rifornimento**, dal preventivo all'acquisto e stoccaggio.
- Le **finanze (Cashflow)** collegate direttamente agli appartamenti e alle strutture.
- Una complessa gestione di **ruoli e permessi** per differenziare l'accesso tra Amministratori, Operatori di Magazzino e Responsabili Acquisti.

---

## 2. Architettura & Stack Tecnologico
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS per lo styling.
- **Backend/Database:** Firebase Authentication (Accesso tramite Google) e Firebase Cloud Firestore (NoSQL).
- **Hosting / Deploy:** Le regole di sicurezza e l'infrastruttura sono state caricate su Vercel ed eseguono Firebase nativamente per la memorizzazione dei dati in tempo reale.

---

## 3. Modello Dati (Struttura Database Firestore)

Il database Firestore è strutturato nelle seguenti collezioni principali:

### `operators` (Operatori ed Utenti)
Gestisce gli accessi e i permessi granulari per ogni utente registrato.
- `name` (string): Nome operatore
- `email` (string): Email (usata per il login OAuth)
- `role` (string): 'magazzino' | 'acquisti' | 'admin'
- `isAdmin` (boolean): Flag per super-amministratori
- `hideFinancials` (boolean): Se true, maschera tutti i dati finanziari e i costi all'operatore.
- `permissions` (map): Permessi modulari di accesso (es. `inventory`, `orders`, `cashflow`, `cashflowEdit`, ecc.)
- `createdAt` (timestamp)

### `items` (Inventario Articoli)
Catalogo globale degli articoli e stato della giacenza.
- `name` (string): Nome articolo
- `category` (string): Categoria
- `quantity` (number): Giacenza attuale
- `unit` (string): Unità di misura (pz, kg, litri, ecc.)
- `price` (number): Costo unitario opzionale
- `minQuantity` (number): Soglia di sottoscorta per avvisi
- `property` (string): Proprietà strutturale a cui è assegnato l'articolo
- `imageUrl` (string): Immagine in Base64 (opzionale)
- `createdAt`, `updatedAt` (timestamp)

### `transactions` (Log dei Movimenti Magazzino)
Traccia permanentemente l'entrata e l'uscita degli articoli per auditing.
- `itemId` (string): ID articolo
- `itemName` (string): Snapshot del nome al momento della transazione
- `type` (string): 'add' (carico) | 'remove' (scarico) | 'edit' (modifica scorte admin/iniziali)
- `quantity` (number): Quantità movimentata
- `date` (timestamp): Data del movimento
- `operator` (string): Nome dell'operatore che ha effettuato l'azione
- `property` (string): Proprietà associata

### `orders` (Ordini di Rifornimento)
Workflow degli ordini di acquisto.
- `items` (array): Lista di articoli ordinati (con quantità e costi parziali)
- `status` (string): 'pending' (Da Acquistare) | 'purchased' (Acquistato) | 'fulfilled' (Ricevuto/Stoccato)
- `totalCost` (number): Costo totale stimato o effettivo dell'ordine
- `createdAt`, `purchasedAt`, `fulfilledAt`, `updatedAt` (timestamp)

### `cashflows` (Movimenti Finanziari e Spese)
Transazioni finanziarie, incassi ed esborsi.
- `type` (string): 'income' (Entrata) | 'expense' (Uscita)
- `amount` (number): Importo €
- `category` (string): Categoria della spesa o incasso
- `apartment` (string): Riferimento all'appartamento legato alla spesa/incasso (Opzionale)
- `date` (timestamp): Data di competenza
- `description` (string): Nota esplicativa
- `receiptUrl` (string): URL/Base64 ricevuta/fattura allegata
- `itemId`, `itemQuantity` (string/number): Collegamento inverso all'acquisto di un oggetto di inventario per automatizzare il carico a magazzino.
- `createdAt`, `updatedAt` (timestamp)

### `cashflowLogs` (Auditing Finanziario)
Tracciamento esplicito delle modifiche per scopi di responsabilità amministrativa.
- `cashflowId` (string)
- `action` (string): 'create' | 'update' | 'delete'
- `modifiedBy` (string): Nome operatore
- `changes` (string | map): Dettaglio delle alterazioni effettuate su un record finanziario.
- `timestamp` (timestamp)

### `settings` (Impostazioni Globali Aziendali)
Gestisce configurazioni in modo centralizzato modificabile solo da Admin.
- `properties` (array): Elenco delle Proprietà primarie/Building
- `apartments` (array): Elenco di Stanze o Appartamenti derivati
- `propertyApartments` / `apartmentProperty` (map): Mappini relazionali per filtri a cascata.
- `incomeCategories` / `expenseCategories` (array): Categorie per la classificazione transazioni.
- `updatedAt` (timestamp)

---

## 4. Logica di Business e Sicurezza (Zero-Trust Model)

La solidità del sistema risiede in un mix di regole frontend/backend e Security Rules native di Firestore:

1. **Gatekeeper Modulare:** L'autenticazione accende un Object React (il contesto `Auth`) che non si affida ciecamente al client ma esegue query sicure sulla tab  `operators`. Tramite la mappa di oggetti boolean di permessi configurati dagli Admin (`inventory`, `orders`, `cashflowEdit`, `reports`), il frontend censura, oscura route e bottoni CRUD (es. bottone `Salva Transazione`). In Firestore lo stesso principio è convalidato dalle check logic: se cerchi di forzare l'API senza esplicito permesso, il DB ti darà "Missing permissions".
2. **Campi Strutturali Immutabili e Costrutti di Forma:**
   - Tramite `hasOnly()` il Database non accetta mai JSON payload inattesi, schivando vulnerability injections. I log operativi (`transactions`, `cashflowLogs`) accettano solo `create` method e bloccano ferocemente updates o delezes anche da Amministratori di Sistema affinché emerga la responsabilizzazione tracciata cronologicamente (`timestamp is request.time`). 
3. **Admin Overrides (Escalation):** Un `admin` globale scavalca alcune check-locks di status e visibilità. Può ad esempio modificare forzatamente la `Giaceanza Iniziale/Attuale` di un articolo in Magazzino senza innescare normali movimenti in transazione, utile per pareggi contabili/riallineamento.

---

## 5. Workflow Core e Gestionali
- **Carico/Scarico Rapido:** Lo strumento principale degli inventaristi. Modificano stock e ciò si traduce in transazioni tracciate unitariamente.
- **La Pipeline degli Ordini:** 
  1. *Pending:* L'operatore nota merci sottoscorte e apre un ordine pending.
  2. *Purchased:* Un buyer conferma lo scontrino ed i costi operativi.
  3. *Fulfilled:* L'inserimento dell'ordine come Fulfilled triggera il completamento transazionale ed aggiorna in massa (batch process) la quantità nell'inventario reale di tutta la merce acquistata.
- **Tracciabilità Finanziamenti (Cashflow Manager):** Le spese e gli inserimenti avvengono in modo relazionale per singola sub-entità (`apartment` / `property`) ed esplodono nel cruscotto Report riepilogativo di Analytics (Reports.tsx) con metriche di guadagni vs spese, ed esposizione netta a cashflow.

## Per ottenere questo documento in formato PDF:
Non essendo fornito all'utente un server per il print/render di stream PDF lato Node, invitiamo ad espletare questa procedura istantanea e standard per questo genere di file sorgente (MD):
A. Apri il file **DOCUMENTAZIONE.md** comodamente tramite un Editor Markdown (come su GitHub standard, VS Code, ecc.) oppure trascinalo in un tool web come _Dillinger.io_, o _Md2Pdf_.
B. Nel tuo Browser Web è tipicamente sufficientemente azionare **Stampa** -> e seleziona come destinazione **"Salva come PDF"** (Save as PDF).
C. In futuro, volendo agganciare generazione live server-side, si potrebbe collegare library di terze parti per esportare intere tabelle da sistema in report PDF diretti.
