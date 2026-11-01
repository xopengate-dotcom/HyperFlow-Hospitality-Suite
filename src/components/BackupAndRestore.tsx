import React, { useState, useRef, useEffect } from 'react';
import { Database, Download, Upload, AlertCircle, CheckCircle2, ChevronRight, FileJson, Clock } from 'lucide-react';
import { collection, getDocs, doc, writeBatch, Timestamp, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import packageJson from '../../package.json';

const COLLECTIONS = [
  'operators',
  'items',
  'transactions',
  'restockOrders',
  'cashflows',
  'cashflowLogs',
  'work_activities',
  'catalogItems',
  'parking_reservations',
  'settings',
  'admins',
  'auditLogs',
  'systemLogs'
];

interface BackupData {
  version: string;
  timestamp: string;
  collections: {
    [collectionName: string]: any[];
  };
}

export function BackupAndRestore() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [pendingRestoreData, setPendingRestoreData] = useState<BackupData | null>(null);
  const [lastBackupInfo, setLastBackupInfo] = useState<{ timestamp: Date, version: string, author: string } | null>(null);

  useEffect(() => {
    const fetchLastBackup = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'backup_info'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.timestamp) {
            setLastBackupInfo({
              timestamp: data.timestamp.toDate(),
              version: data.version || 'Sconosciuta',
              author: data.author || 'Utente'
            });
          }
        }
      } catch (err) {
        console.warn("Impossibile caricare info ultimo backup", err);
      }
    };
    fetchLastBackup();
  }, []);

  // Helper per serializzare ricorsivamente i Timestamp Firestore in oggetti decodificabili
  const serializeData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (data instanceof Timestamp || (typeof data === 'object' && typeof data.toDate === 'function')) {
      return { __type: 'timestamp', value: data.toDate().toISOString() };
    }
    if (Array.isArray(data)) {
      return data.map(serializeData);
    }
    if (typeof data === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = serializeData(value);
      }
      return result;
    }
    return data;
  };

  // Helper per deserializzare ricorsivamente un backup e ritornare Date (Firestore setDoc gestisce Date)
  const deserializeData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (typeof data === 'object' && data.__type === 'timestamp' && data.value) {
      return new Date(data.value);
    }
    if (Array.isArray(data)) {
      return data.map(deserializeData);
    }
    if (typeof data === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = deserializeData(value);
      }
      return result;
    }
    return data;
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupStatus({ type: 'info', message: 'Avvio esportazione dati in corso...' });
    
    try {
      const collectionsData: { [key: string]: any[] } = {};
      
      for (const colName of COLLECTIONS) {
        const querySnapshot = await getDocs(collection(db, colName));
        const docs = querySnapshot.docs.map(doc => {
          return {
            __id: doc.id,
            ...serializeData(doc.data())
          };
        });
        collectionsData[colName] = docs;
      }
      
      const backupObj: BackupData = {
        version: packageJson.version,
        timestamp: new Date().toISOString(),
        collections: collectionsData
      };
      
      const jsonString = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      
      link.download = `hyperflow_backup_v${packageJson.version}_${dateStr}_${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      try {
        await setDoc(doc(db, 'settings', 'backup_info'), {
          timestamp: serverTimestamp(),
          version: packageJson.version,
          author: auth.currentUser?.email || auth.currentUser?.displayName || 'Admin'
        });
        setLastBackupInfo({
          timestamp: new Date(),
          version: packageJson.version,
          author: auth.currentUser?.email || auth.currentUser?.displayName || 'Admin'
        });
      } catch (saveErr) {
        console.warn("Impossibile salvare traccia del backup", saveErr);
      }

      setBackupStatus({ type: 'success', message: 'Backup scaricato con successo!' });
    } catch (err: any) {
      console.error("Errore backup", err);
      setBackupStatus({ type: 'error', message: 'Errore durante la creazione del backup: ' + err.message });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreStatus({ type: 'info', message: 'Lettura del file in corso...' });
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const parsed = JSON.parse(json) as BackupData;
        
        if (!parsed.version || !parsed.timestamp || !parsed.collections) {
          throw new Error("Formato del file di backup non valido.");
        }
        
        setPendingRestoreData(parsed);
        setRestoreStatus(null);
      } catch (err: any) {
         setRestoreStatus({ type: 'error', message: 'Errore di parsing del file: ' + err.message });
         setPendingRestoreData(null);
      }
    };
    reader.onerror = () => {
      setRestoreStatus({ type: 'error', message: 'Impossibile leggere il file.' });
      setPendingRestoreData(null);
    };
    reader.readAsText(file);
    
    // Resetta l'input file per permettere di riselezionare lo stesso file se necessario
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!pendingRestoreData) return;
    
    const confirmRestore = window.confirm(
      "ATTENZIONE: Stai per sovrascrivere o aggiungere record al database attuale con i dati di questo backup. " +
      "Se in passato hai eliminato dei dati o cambiato delle regole, questo potrebbe creare conflitti. " +
      "SI CONSIGLIA VIVAMENTE DI FARE UN BACKUP DELLO STATO ATTUALE PRIMA DI PROCEDERE. Vuoi procedere col ripristino?"
    );
    
    if (!confirmRestore) return;
    
    setIsRestoring(true);
    setRestoreStatus({ type: 'info', message: 'Ripristino dei dati in corso. Potrebbe richiedere alcuni minuti...' });
    
    try {
      const collectionsToRestore = pendingRestoreData.collections;
      
      for (const colName of Object.keys(collectionsToRestore)) {
        if (!COLLECTIONS.includes(colName)) continue; // Evita di ripristinare collezioni non supportate o obsolete
        
        const docs = collectionsToRestore[colName];
        
        // Firestore limita i batch a 500 operazioni, processiamo a blocchi
        const batchSize = 400; // Un margine di sicurezza
        for (let i = 0; i < docs.length; i += batchSize) {
          const chunk = docs.slice(i, i + batchSize);
          const batch = writeBatch(db);
          
          for (const docData of chunk) {
            const { __id, ...rest } = docData;
            if (__id) {
              const docRef = doc(db, colName, __id);
              batch.set(docRef, deserializeData(rest)); // overwrite and insert
            }
          }
          await batch.commit();
        }
      }
      
      setRestoreStatus({ type: 'success', message: 'Ripristino completato con successo! Ricarica la pagina per visualizzare i dati aggiornati.' });
      setPendingRestoreData(null);
    } catch (err: any) {
      console.error("Errore restore", err);
      setRestoreStatus({ type: 'error', message: 'Errore durante il ripristino: ' + err.message });
    } finally {
      setIsRestoring(false);
    }
  };

  const getTotalRecords = (collections: BackupData['collections']) => {
    return Object.values(collections).reduce((total, docs) => total + docs.length, 0);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100/50 text-blue-600 rounded-2xl">
          <Database size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Gestione Backup e Ripristino</h1>
          <p className="text-gray-500 mt-1">Salva in locale tutti i documenti o ripristina lo stato precedente in formato JSON.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Pannello BACKUP */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-start gap-4">
          <div className="flex items-center gap-3 text-blue-600">
            <Download size={24} />
            <div className="flex flex-col">
               <h2 className="text-xl font-bold text-gray-900 leading-none">Salva Backup JSON</h2>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Crea un file completo contenente inventario, anagrafiche, operatori, transazioni, work activities, cashflow e ordini. Il file sarà utile per il disaster recovery in locale.
          </p>

          {lastBackupInfo && (
            <div className="w-full bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex flex-col gap-2">
               <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider">
                 <Clock size={14} /> Ultimo Backup Eseguito
               </div>
               <div className="text-sm text-gray-700 font-medium flex justify-between">
                 <span>Data:</span> <span>{lastBackupInfo.timestamp.toLocaleString()}</span>
               </div>
               <div className="text-sm text-gray-700 font-medium flex justify-between">
                 <span>Autore:</span> <span className="truncate max-w-[200px]">{lastBackupInfo.author}</span>
               </div>
               <div className="text-sm text-gray-700 font-medium flex justify-between">
                 <span>Versione:</span> <span>v{lastBackupInfo.version}</span>
               </div>
            </div>
          )}
          
          {backupStatus && (
            <div className={`w-full p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
              backupStatus.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
              backupStatus.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' :
              'bg-blue-50 text-blue-600 border border-blue-100'
            }`}>
               {backupStatus.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
               {backupStatus.message}
            </div>
          )}

          <button
            disabled={isBackingUp}
            onClick={handleBackup}
            className={`mt-2 flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl transition font-medium shadow-sm border
              ${isBackingUp ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'}`}
          >
            <Download size={20} />
            {isBackingUp ? 'Esportazione in corso...' : 'Scarica file di backup'}
          </button>
        </div>

        {/* Pannello RESTORE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-start gap-4">
          <div className="flex items-center gap-3 text-emerald-600">
            <Upload size={24} />
            <h2 className="text-xl font-bold text-gray-900">Ripristino da JSON</h2>
          </div>
          <p className="text-sm text-gray-500">
            Carica un file di backup JSON per reintegrare o sovrascrivere lo stato corrente. Seleziona il file per vedere i dettagli dell'istantanea prima di confermare.
          </p>
          
          <input 
            type="file" 
            accept="application/json" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
          />
          
          {!pendingRestoreData && (
             <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex items-center justify-center gap-2 w-full px-6 py-3 bg-white text-gray-700 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-xl transition font-medium"
             >
               <FileJson size={20} />
               Scegli file di backup...
             </button>
          )}

          {pendingRestoreData && (
             <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Info Backup</span>
                   <button onClick={() => setPendingRestoreData(null)} title="Annulla selezione" className="text-gray-400 hover:text-gray-600">
                     <AlertCircle size={16} />
                   </button>
                </div>
                
                <div className="space-y-1 text-sm text-gray-900 font-medium">
                   <div className="flex justify-between items-center"><span className="text-gray-500">Versione App:</span> <span>v{pendingRestoreData.version}</span></div>
                   <div className="flex justify-between items-center"><span className="text-gray-500">Data Backup:</span> <span>{new Date(pendingRestoreData.timestamp).toLocaleString()}</span></div>
                   <div className="flex justify-between items-center"><span className="text-gray-500">Record totali:</span> <span>{getTotalRecords(pendingRestoreData.collections)} voci</span></div>
                </div>
                
                <button
                  disabled={isRestoring}
                  onClick={handleRestore}
                  className={`mt-2 flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl transition font-medium shadow-sm border
                    ${isRestoring ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-red-600 text-white hover:bg-red-700 border-red-600'}`}
                >
                  <Upload size={18} />
                  {isRestoring ? 'Ripristino in corso...' : 'Conferma Ripristino'}
                </button>
             </div>
          )}

          {restoreStatus && (
            <div className={`w-full p-4 rounded-xl text-sm font-medium flex gap-2 ${
              restoreStatus.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
              restoreStatus.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' :
              'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
               <div className="mt-0.5">{restoreStatus.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</div>
               <div className="flex-1">{restoreStatus.message}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
