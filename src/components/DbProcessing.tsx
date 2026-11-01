import React, { useState, useEffect } from 'react';
import { useAuthContext } from './Auth';
import { db } from '../firebase/config';
import { collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useSettings } from './SettingsProvider';
import { Database, ArrowRightLeft, ArrowRight, Save, Settings2, Trash2 } from 'lucide-react';
import { Item } from '../types';

export function DbProcessing() {
  const { user, isAdmin } = useAuthContext();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Scambio Dati State
  const [propA, setPropA] = useState('');
  const [propB, setPropB] = useState('');
  const [matchingItems, setMatchingItems] = useState<any[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showDangerZone, setShowDangerZone] = useState(false);

  if (!isAdmin && user?.email?.toLowerCase() !== 'xopengate@gmail.com') {
    return null;
  }

  // Find matching items when properties change
  useEffect(() => {
    async function fetchMatches() {
      if (!propA || !propB || propA === propB) {
        setMatchingItems([]);
        return;
      }
      setLoading(true);
      try {
        const itemsSnap = await getDocs(collection(db, 'items'));
        const allItems = itemsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any));
        
        const itemsA = allItems.filter(i => i.property === propA);
        const itemsB = allItems.filter(i => i.property === propB);
        
        const matches = [];
        for (const itemA of itemsA) {
          const itemB = itemsB.find(i => (i.name || '').toLowerCase().trim() === (itemA.name || '').toLowerCase().trim());
          if (itemB) {
            matches.push({
              name: itemA.name,
              category: itemA.category,
              itemA,
              itemB
            });
          }
        }
        
        matches.sort((a, b) => {
          if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
          return (a.name || '').localeCompare(b.name || '');
        });
        
        setMatchingItems(matches);
        setSelectedItemIds(matches.map(m => m.name)); // seleziona tutti di default
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchMatches();
  }, [propA, propB]);

  const handleSwap = async () => {
    if (selectedItemIds.length === 0) return;
    if (!window.confirm(`Sei sicuro di voler invertire le giacenze di ${selectedItemIds.length} articoli tra ${propA} e ${propB}?`)) return;
    
    setLoading(true);
    setMessage("Elaborazione inversione in corso...");
    try {
      let batch = writeBatch(db);
      let swapCount = 0;

      for (const match of matchingItems) {
         if (selectedItemIds.includes(match.name)) {
            batch.update(match.itemA.ref, { quantity: match.itemB.quantity || 0, updatedAt: serverTimestamp() });
            batch.update(match.itemB.ref, { quantity: match.itemA.quantity || 0, updatedAt: serverTimestamp() });
            swapCount++;
         }
      }

      if (swapCount > 0) {
         await batch.commit();
         setMessage(`Operazione completata! Invertiti ${swapCount} articoli.`);
         
         // Aggiorna localmente le quantità per riflettere lo swap senza fare un reload completo
         setMatchingItems(prev => prev.map(m => {
           if (selectedItemIds.includes(m.name)) {
             return {
               ...m,
               itemA: { ...m.itemA, quantity: m.itemB.quantity || 0 },
               itemB: { ...m.itemB, quantity: m.itemA.quantity || 0 }
             };
           }
           return m;
         }));
      }
    } catch (e: any) {
      console.error(e);
      setMessage('Errore: ' + e.message);
    } finally {
       setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm("Sei sicuro di voler resettare tutti i dati di test (transazioni, ordini, giacenze)? I vini verranno mantenuti.")) return;
    setLoading(true);
    setMessage('Inizio pulizia in corso...');
    try {
      const ordersSnap = await getDocs(collection(db, 'restockOrders'));
      let batch = writeBatch(db); let count = 0;
      for (const d of ordersSnap.docs) { batch.delete(d.ref); count++; if (count >= 490) { await batch.commit(); batch = writeBatch(db); count = 0; } }
      if (count > 0) { await batch.commit(); count = 0; }
      
      const transactionsSnap = await getDocs(collection(db, 'transactions'));
      batch = writeBatch(db); count = 0;
      for (const d of transactionsSnap.docs) {
        const data = d.data(); const itemName = (data.itemName || '').toLowerCase();
        let keep = false;
        if (itemName.includes('vino bianco') || itemName.includes('vino rosé') || itemName.includes('vino rose')) {
             if (data.type === 'out' && data.quantity === 1) {
                  const dateObj = data.date?.toDate?.() || new Date();
                  const dStr = dateObj.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                  if (dStr.includes('02/05') || dStr.includes('28/04') || dStr.includes('05/02') || dStr.includes('04/28')) keep = true;
             }
        }
        if (!keep) { batch.delete(d.ref); count++; }
        if (count >= 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      if (count > 0) { await batch.commit(); count = 0; }

      const itemsSnap = await getDocs(collection(db, 'items'));
      batch = writeBatch(db); count = 0;
      for (const d of itemsSnap.docs) {
        const data = d.data(); const itemName = (data.name || '').toLowerCase();
        if (!itemName.includes('vino')) { batch.update(d.ref, { quantity: 0, updatedAt: serverTimestamp() }); count++; }
        if (count >= 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      if (count > 0) { await batch.commit(); count = 0; }

      setMessage('Pulizia completata con successo!');
    } catch (e: any) { setMessage('Errore: ' + e.message); } finally { setLoading(false); }
  };

  const handleFixNotes = async () => {
    if (!window.confirm("Procedere con l'aggiornamento in blocco delle note mancanti nei movimenti?")) return;
    setLoading(true); setMessage('Popolamento in corso...');
    try {
      const allTxSnap = await getDocs(collection(db, 'transactions'));
      let batch = writeBatch(db); let count = 0; let totalCount = 0;
      for (const d of allTxSnap.docs) {
        const data = d.data();
        if (!data.notes || data.notes.trim() === '') {
           let newNotes = data.type === 'in' ? `Carico in magazzino ${data.property || ''}`.trim() : `Scarico verso ${data.apartment || 'destinazione'}`;
           batch.update(d.ref, { notes: newNotes }); count++; totalCount++;
        }
        if (count >= 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      if (count > 0) await batch.commit();
      setMessage(`Aggiornate le note di ${totalCount} transazioni con successo!`);
    } catch (e: any) { setMessage('Errore: ' + e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
             <Database className="text-blue-600" />
             Elaborazione Dati DB
          </h2>
          <p className="text-gray-500 mt-1">Strumenti di manutenzione e trasferimento scorte tra proprietà.</p>
        </div>
      </div>

      <div className="bg-white border text-gray-800 border-gray-100 p-6 rounded-2xl shadow-sm">
         <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
           <ArrowRightLeft className="text-indigo-600" size={20} />
           Inversione / Allineamento Scorte tra Proprietà
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Proprietà Sorgente (A)</label>
               <select value={propA} onChange={e => setPropA(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold">
                  <option value="">Seleziona...</option>
                  {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Proprietà Destinazione (B)</label>
               <select value={propB} onChange={e => setPropB(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold">
                  <option value="">Seleziona...</option>
                  {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
               </select>
            </div>
         </div>

         {loading && <div className="p-4 text-center text-blue-600 font-medium animate-pulse">Caricamento in corso...</div>}

         {message && <div className="mb-4 p-3 bg-green-50 text-green-700 border border-green-200 rounded-xl font-medium">{message}</div>}

         {matchingItems.length > 0 && (
           <div className="border border-gray-200 rounded-xl overflow-hidden mt-4">
             <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center text-sm">
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                   <input type="checkbox" checked={selectedItemIds.length === matchingItems.length} onChange={(e) => setSelectedItemIds(e.target.checked ? matchingItems.map(m => m.name) : [])} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                   Descrizione Articolo ({matchingItems.length})
                </label>
                <div className="flex text-xs font-bold text-gray-500 uppercase">
                   <span className="w-20 text-center truncate px-1" title={propA}>{propA.substring(0, 10)}...</span>
                   <span className="w-20 text-center truncate px-1" title={propB}>{propB.substring(0, 10)}...</span>
                </div>
             </div>
             <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
                {matchingItems.map((match, idx) => (
                  <label key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer transition">
                     <div className="flex items-center gap-3">
                        <input type="checkbox" checked={selectedItemIds.includes(match.name)} onChange={(e) => {
                           if (e.target.checked) setSelectedItemIds(prev => [...prev, match.name]);
                           else setSelectedItemIds(prev => prev.filter(id => id !== match.name));
                        }} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                        <div>
                           <div className="text-sm font-semibold">{match.name}</div>
                           <div className="text-[10px] text-gray-400">{match.category}</div>
                        </div>
                     </div>
                     <div className="flex text-sm font-bold">
                        <span className={`w-20 text-center ${match.itemA.quantity > 0 ? 'text-green-600' : 'text-gray-400'}`}>{match.itemA.quantity || 0}</span>
                        <ArrowRightLeft className="text-gray-300 mx-1 shrink-0" size={14} />
                        <span className={`w-20 text-center ${match.itemB.quantity > 0 ? 'text-green-600' : 'text-gray-400'}`}>{match.itemB.quantity || 0}</span>
                     </div>
                  </label>
                ))}
             </div>
             <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                <button 
                  onClick={handleSwap} 
                  disabled={selectedItemIds.length === 0 || loading}
                  className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center shadow-sm cursor-pointer disabled:opacity-50"
               >
                  Inverti le Giacenze ({selectedItemIds.length})
                </button>
             </div>
           </div>
         )}

         {propA && propB && propA !== propB && matchingItems.length === 0 && !loading && (
            <div className="text-center p-6 text-gray-500">Nessun articolo corrispondente trovato in entrambe le proprietà.</div>
         )}
      </div>

       <div className="mt-8 border border-red-200 rounded-2xl overflow-hidden shadow-sm">
         <div 
           className="bg-red-50 p-4 flex items-center justify-between cursor-pointer hover:bg-red-100 transition"
           onClick={() => setShowDangerZone(!showDangerZone)}
         >
            <div className="flex items-center gap-3 text-red-800">
               <Trash2 size={20} />
               <h3 className="font-bold">Zona Pericolosa (Sviluppo)</h3>
            </div>
            <div className="text-red-800 font-bold">{showDangerZone ? 'Nascondi' : 'Mostra'}</div>
         </div>
         {showDangerZone && (
            <div className="p-6 bg-white space-y-4">
               <p className="text-red-600 text-sm mb-4 font-medium max-w-2xl">Questi strumenti operano in blocco sull'intero DB. Usali solo in fase di sviluppo/test.</p>
               
               <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button
                     onClick={handleCleanup}
                     disabled={loading}
                     className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-xl font-medium transition shadow-sm cursor-pointer flex items-center justify-center w-full sm:w-auto"
                  >
                     {loading ? 'Pulizia...' : '⚡ Azzera Db Test (Mantieni Vini)'}
                  </button>
                  <button
                     onClick={handleFixNotes}
                     disabled={loading}
                     className="px-4 py-2 text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-xl font-medium transition cursor-pointer flex items-center justify-center w-full sm:w-auto"
                  >
                     {loading ? 'Patching...' : '🔧 Fix Note Storico Vuote'}
                  </button>
               </div>
            </div>
         )}
      </div>

    </div>
  );
}

