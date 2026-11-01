import React, { useState, useEffect, useMemo } from 'react';
import { Item, Transaction } from '../types';
import { getItems, addTransaction, getTransactions, updateHousekeepingOrder } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { RefreshCw, MapPin, Search, Plus, Minus, TriangleAlert, Info, Save, Calendar, FileText, ArrowLeftRight, ChevronDown, ChevronRight, PackageCheck, ListOrdered, ArrowUp, ArrowDown, FileDown } from 'lucide-react';
import { useAuthContext } from './Auth';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { HousekeepingConsumiReport } from './HousekeepingConsumiReport';

export function Housekeeping() {
  const [activeTab, setActiveTab] = useState<'operativo' | 'report-consumi' | 'report' | 'ordinamento'>('operativo');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const { settings } = useSettings();
  const { properties, apartments, propertyApartments } = settings;
  const [selectedApartment, setSelectedApartment] = useState<string>(apartments[0] || 'Tutti');
  const [searchQuery, setSearchQuery] = useState('');
  
  const { isAdmin } = useAuthContext();

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, {
      id: string;
      dateStr: string;
      dateRaw: Date;
      operator: string;
      apartment: string;
      transactions: Transaction[];
    }> = {};

    transactions.forEach(t => {
      // Group by minute
      const timeStr = format(t.date, "yyyy-MM-dd-HH-mm", { locale: it });
      const op = t.operator || 'Sconosciuto';
      const apt = t.apartment || 'Nessuno';
      const groupId = `${timeStr}_${op}_${apt}`;

      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          dateStr: format(t.date, "dd MMM yyyy, HH:mm", { locale: it }),
          dateRaw: t.date,
          operator: t.operator || '-',
          apartment: t.apartment || '',
          transactions: []
        };
      }
      groups[groupId].transactions.push(t);
    });

    return Object.values(groups).sort((a, b) => b.dateRaw.getTime() - a.dateRaw.getTime());
  }, [transactions]);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'operativo' || activeTab === 'ordinamento') {
      loadItems();
    } else if (activeTab === 'report') {
      loadTransactions();
    } else if (activeTab === 'report-consumi') {
      loadItems();
      loadTransactions();
    }
  }, [activeTab]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await getTransactions();
      // Filter only housekeeping transactions
      const hkTransactions = data.filter(t => t.notes?.includes('Consumi/Refill Housekeeping') || t.notes?.includes('Housekeeping'));
      setTransactions(hkTransactions);
      setError('');
    } catch (e: any) {
      setError('Errore di caricamento report.');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const allItems = await getItems();
      setItems(allItems);
      setAdjustments({});
      setError('');
    } catch (e: any) {
      setError('Errore di caricamento.');
    } finally {
      setLoading(false);
    }
  };

  const housekeepingItems = useMemo(() => {
    return items.filter(item => {
      // Must be visible in Housekeeping
      if (!item.showInHousekeeping) return false;
      
      if (selectedApartment !== 'Tutti') {
        if (item.visibleInApartments && item.visibleInApartments.length > 0) {
           // Explicit visibility list provided (es. Supplier item)
           if (!item.visibleInApartments.includes(selectedApartment)) {
             return false;
           }
        } else {
          // Default fall-back logic based on owner of the property
          const expectedProperty = settings.apartmentProperty[selectedApartment];
          const isGeneric = item.property === 'Tutte le Proprietà' || item.property === 'Tutte' || !item.property;
          const propertyOwnsApartments = item.property ? (settings.propertyApartments[item.property] || []).length > 0 : false;
          
          if (item.property !== expectedProperty && !isGeneric && propertyOwnsApartments) {
             return false;
          }
        }
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!item.name.toLowerCase().includes(query) && 
            !item.category.toLowerCase().includes(query) &&
            !(item.barcode && item.barcode.includes(query))) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => (a.hkOrder ?? 9999) - (b.hkOrder ?? 9999) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [items, selectedApartment, searchQuery]);

  const handleAdjustQuantity = (item: Item, delta: number) => {
    setAdjustments(prev => {
      const currentDelta = prev[item.id] || 0;
      const newDelta = currentDelta + delta;
      
      // Prevent negative total stock (except for Biancheria and Noleggio)
      if (!['Biancheria', 'noleggio', 'Noleggio', 'NOLEGGIO'].includes(item.category) && item.quantity + newDelta < 0) return prev;
      
      return {
        ...prev,
        [item.id]: newDelta
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    let hasErrors = false;
    let savedCount = 0;

    for (const [itemId, deltaVal] of Object.entries(adjustments)) {
      const delta = Number(deltaVal);
      if (delta === 0) continue;
      
      const item = items.find(i => i.id === itemId);
      if (!item) continue;
      
      const type = delta > 0 ? 'in' : 'out';
      const absDelta = Math.abs(delta);
      
      try {
         let customDate = new Date();
         if (selectedDate) {
            const [y, m, d] = selectedDate.split('-');
            const now = new Date();
            customDate = new Date(Number(y), Number(m)-1, Number(d), now.getHours(), now.getMinutes(), now.getSeconds());
         }

         await addTransaction(
           item,
           type,
           absDelta,
           selectedApartment === 'Tutti' ? undefined : selectedApartment,
           `Consumi/Refill Housekeeping`,
           customDate
         );
         savedCount++;
      } catch (e) {
         console.error(`Errore salvataggio qty Housekeeping per ${item.name}`, e);
         hasErrors = true;
      }
    }
    
    if (!hasErrors && savedCount > 0) {
       await loadItems(); // reload fresh local entries
       setSaving(false);
    } else if (hasErrors) {
       setError("Alcuni aggiornamenti non sono stati salvati. Riprova.");
       setSaving(false);
    } else {
       setSaving(false);
    }
  };

  const hasAdjustments = Object.values(adjustments).some(v => v !== 0);

  const groupedItems = useMemo(() => {
    const acc: Record<string, Item[]> = {};
    housekeepingItems.forEach(item => {
       if (!acc[item.category]) acc[item.category] = [];
       acc[item.category].push(item);
    });
    return acc;
  }, [housekeepingItems]);

  const groupedItemsKeys = useMemo(() => {
    const cats: string[] = [];
    housekeepingItems.forEach(i => {
      if (!cats.includes(i.category)) cats.push(i.category);
    });
    return cats;
  }, [housekeepingItems]);

  const handleMoveOrder = async (index: number, direction: -1 | 1) => {
    const newItems = [...housekeepingItems];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    
    setSaving(true);
    const orders = newItems.map((item, i) => ({ id: item.id, hkOrder: i }));
    try {
      await updateHousekeepingOrder(orders);
      await loadItems();
    } catch(e) {
      alert("Errore nel salvataggio dell'ordinamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            Modulo Housekeeping
          </h1>
          <p className="text-gray-500 mt-1">Gestisci la fornitura e traccia i consumi degli appartamenti.</p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0 items-center">
          <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setActiveTab('operativo')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${activeTab === 'operativo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <ArrowLeftRight size={18} />
              Operatività
            </button>
            <button
              onClick={() => setActiveTab('report-consumi')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${activeTab === 'report-consumi' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FileDown size={18} />
              Report Consumi
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${activeTab === 'report' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FileText size={18} />
              Storico
            </button>
            <button
              onClick={() => setActiveTab('ordinamento')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${activeTab === 'ordinamento' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <ListOrdered size={18} />
              <span className="hidden sm:inline">Ordinamento</span>
            </button>
          </div>
          {hasAdjustments && activeTab === 'operativo' && (
            <button 
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium shadow-sm disabled:opacity-50"
            >
              {saving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
              <span className="hidden sm:inline">{saving ? 'Salvataggio...' : 'Salva Consumi'}</span>
              <span className="sm:hidden">{saving ? 'Salvataggio...' : 'Salva'}</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'operativo' ? (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Cerca lenzuola, teli, saponi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-medium"
          />
        </div>
        
        <div className="w-full sm:w-64 shrink-0">
          <div className="relative">
             <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
             <input
               type="date"
               value={selectedDate}
               onChange={(e) => setSelectedDate(e.target.value)}
               className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none font-semibold text-gray-700 cursor-pointer"
             />
          </div>
        </div>

        <div className="w-full sm:w-64 shrink-0">
          <div className="relative">
             <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
             <select
               value={selectedApartment}
               onChange={(e) => {
                 setSelectedApartment(e.target.value);
                 setAdjustments({});
               }}
               className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl appearance-none focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none font-semibold text-gray-700 cursor-pointer"
             >
               <option value="Tutti">Seleziona Appartamento...</option>
               {properties.map(p => (
                 <optgroup key={p} label={p}>
                   {(propertyApartments[p] || []).map(a => (
                     <option key={a} value={a}>{a}</option>
                   ))}
                 </optgroup>
               ))}
             </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      {selectedApartment === 'Tutti' && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
           <Info className="text-blue-600 shrink-0 mt-0.5" size={20}/>
           <p className="text-sm text-blue-800 font-medium leading-relaxed">
             Seleziona un appartamento specifico dal menu a tendina per registrare il consumo di biancheria e forniture di quell'appartamento.
           </p>
        </div>
      )}

      {loading && !saving ? (
        <div className="flex justify-center py-20">
          <RefreshCw size={32} className="animate-spin text-gray-300" />
        </div>
      ) : Object.keys(groupedItems).length > 0 ? (
        <div className="space-y-8">
           {groupedItemsKeys.map(category => (
             <div key={category}>
                <h3 className="text-lg font-bold text-gray-900 mb-4 px-1 border-b border-gray-100 pb-2">{category}</h3>
                <div className="flex flex-col gap-2">
                  {groupedItems[category].map(item => {
                    const delta = adjustments[item.id] || 0;
                    const finalQuantity = item.quantity + delta;
                    const inSottoscorta = item.minQuantity !== undefined && finalQuantity <= item.minQuantity && finalQuantity > 0;
                    const esaurito = finalQuantity === 0;

                    return (
                    <div key={item.id} className={`bg-white py-3 px-4 sm:px-6 rounded-2xl shadow-sm border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition ${delta !== 0 ? 'border-blue-400 ring-1 ring-blue-400 ring-opacity-50' : 'border-gray-100'}`}>
                       <div className="flex-1 flex flex-col">
                          <div className="flex items-center gap-3">
                            <h4 className="font-bold text-gray-900 text-base">{item.name}</h4>
                            {inSottoscorta && (
                               <span className="flex items-center gap-1 text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                 Sottoscorta
                               </span>
                            )}
                            {esaurito && (
                               <span className="flex items-center gap-1 text-red-500 bg-red-50 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                 Esaurito
                               </span>
                            )}
                          </div>
                          {delta !== 0 && (
                             <div className={`text-xs font-bold mt-1 ${delta > 0 ? 'text-green-600' : 'text-blue-600'}`}>
                               {delta > 0 ? `+${delta} in reso (incremento stock logico)` : `${delta} prelevato (decremento stock magazzino)`}
                             </div>
                          )}
                       </div>
                       
                       <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto mt-2 sm:mt-0">
                          <div className="flex flex-col items-start sm:items-end w-20">
                             <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-0.5">Disponibilità</span>
                             <div className="flex items-center gap-1">
                                <span className={`text-xl font-black leading-none ${esaurito ? 'text-red-500' : inSottoscorta ? 'text-orange-500' : 'text-gray-900'}`}>
                                   {finalQuantity}
                                </span>
                                <span className="text-xs text-gray-400 font-medium">{item.unit}</span>
                             </div>
                          </div>
                          
                          <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100 shadow-inner">
                             <button 
                               onClick={() => handleAdjustQuantity(item, -1)}
                               disabled={finalQuantity <= 0 && !['Biancheria', 'noleggio', 'Noleggio', 'NOLEGGIO'].includes(item.category)}
                               className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Preleva 1 unità"
                             >
                                <Minus size={20} />
                             </button>
                             <div className="w-10 text-center font-black text-gray-900 text-lg">
                               {Math.abs(delta)}
                             </div>
                             <button 
                               onClick={() => handleAdjustQuantity(item, 1)}
                               className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white hover:text-green-600 hover:shadow-sm rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Rendi 1 unità"
                             >
                                <Plus size={20} />
                             </button>
                          </div>
                       </div>
                    </div>
                  )}
                  )}
                </div>
             </div>
           ))}
        </div>
      ) : (
        selectedApartment !== 'Tutti' && (
           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-lg font-medium mb-2">Nessun articolo trovabile o disponibile in questo contesto.</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">Puoi abilitare la visibilità degli articoli spuntando la voce "Visibilità in Housekeeping" modificando un articolo nell'Inventario o nel Catalogo.</p>
           </div>
         )
       )}
      </div>
      ) : activeTab === 'report-consumi' ? (
        <HousekeepingConsumiReport
          items={items}
          transactions={transactions}
          loading={loading}
          onRefresh={async () => {
            await Promise.all([loadItems(), loadTransactions()]);
          }}
        />
      ) : activeTab === 'report' ? (
        <div className="space-y-6 animate-in fade-in">
          {loading ? (
            <div className="flex justify-center py-20">
              <RefreshCw size={32} className="animate-spin text-gray-300" />
            </div>
          ) : transactions.length > 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">

               <div className="divide-y divide-gray-100">
                 {groupedTransactions.map(group => {
                   const isExpanded = expandedGroups[group.id];
                   const totalItems = group.transactions.length;
                   const isInOut = group.transactions.some(t => t.type !== 'edit');
                   
                   return (
                     <div key={group.id} className="flex flex-col bg-white">
                       <button 
                         onClick={() => toggleGroup(group.id)}
                         className="flex items-center justify-between p-4 sm:px-6 hover:bg-gray-50 transition text-left cursor-pointer focus:outline-none"
                       >
                         <div className="flex gap-4 items-center">
                           <div className={`p-2 rounded-lg ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                             {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                           </div>
                           <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                               <span className="font-bold text-gray-900 text-sm sm:text-base">
                                 Operazione del {group.dateStr}
                               </span>
                               {group.apartment && (
                                 <span className="hidden sm:inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold items-center gap-1">
                                   <MapPin size={10} /> {group.apartment}
                                 </span>
                               )}
                             </div>
                             <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                               <span><strong className="text-gray-700 font-semibold">{totalItems}</strong> {totalItems === 1 ? 'attività' : 'attività'}</span>
                               <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                               <span>Operatore: <strong className="text-gray-700 font-semibold">{group.operator}</strong></span>
                               {group.apartment && (
                                 <span className="sm:hidden flex px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] items-center gap-1 ml-1 font-bold">
                                   {group.apartment}
                                 </span>
                               )}
                             </div>
                           </div>
                         </div>
                       </button>

                       {isExpanded && (
                         <div className="bg-gray-50/50 border-t border-gray-100 p-4 sm:px-6 sm:py-5">
                           
                           {/* Desktop inner table */}
                           <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                             <table className="w-full text-left border-collapse">
                               <thead>
                                 <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                                   <th className="px-4 py-3">Articolo</th>
                                   <th className="px-4 py-3 text-center">Tipologia</th>
                                   <th className="px-4 py-3 text-right">Quantità / Dettaglio</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-gray-50 text-sm">
                                 {group.transactions.map(t => (
                                   <tr key={t.id} className="hover:bg-gray-50 transition">
                                     <td className="px-4 py-3 font-semibold text-gray-900">
                                       {t.itemName}
                                     </td>
                                     <td className="px-4 py-3 text-center">
                                       {t.type === 'edit' ? (
                                         <span className="inline-flex items-center justify-center bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs font-bold">
                                           INFO / MODIFICA
                                         </span>
                                       ) : t.type === 'in' ? (
                                         <span className="inline-flex items-center justify-center bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-bold">
                                           RESO
                                         </span>
                                       ) : (
                                         <span className="inline-flex items-center justify-center bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                                           PRELIEVO
                                         </span>
                                       )}
                                     </td>
                                     <td className="px-4 py-3 text-right">
                                       {t.type === 'edit' ? (
                                         <span className="text-gray-500 text-xs italic">{t.notes || 'Aggiornamento magazzino'}</span>
                                       ) : (
                                         <span className={`font-black text-lg ${t.type === 'in' ? 'text-green-600' : 'text-blue-600'}`}>
                                           {t.type === 'in' ? '+' : '-'}{t.quantity}
                                         </span>
                                       )}
                                     </td>
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                           </div>

                           {/* Mobile inner list */}
                           <div className="block sm:hidden space-y-2">
                             {group.transactions.map(t => (
                               <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-center shadow-sm">
                                 <div className="flex flex-col gap-1 min-w-0 pr-2">
                                   <span className="text-sm font-bold text-gray-900 truncate">
                                     {t.itemName}
                                   </span>
                                   {t.type === 'edit' ? (
                                     <span className="text-xs text-gray-500 italic block line-clamp-1">{t.notes || 'Modifica articolo'}</span>
                                   ) : (
                                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                       {t.type === 'in' ? 'Reso a magazzino' : 'Prelievo'}
                                     </span>
                                   )}
                                 </div>
                                 <div className="shrink-0 text-right">
                                   {t.type === 'edit' ? (
                                     <span className="inline-flex py-0.5 px-1.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase">
                                       Info
                                     </span>
                                   ) : (
                                     <span className={`text-lg font-black ${t.type === 'in' ? 'text-green-600' : 'text-blue-600'}`}>
                                       {t.type === 'in' ? '+' : '-'}{t.quantity}
                                     </span>
                                   )}
                                 </div>
                               </div>
                             ))}
                           </div>

                         </div>
                       )}
                     </div>
                   );
                 })}
               </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center flex flex-col items-center">
              <FileText className="text-gray-300 mb-4" size={48} />
              <p className="text-gray-400 text-lg font-medium">Nessun movimento registrato.</p>
              <p className="text-sm text-gray-500 mt-1 max-w-md">Le operazioni registrate tramite la Tab "Operatività" compariranno qui.</p>
            </div>
          )}
        </div>
      ) : activeTab === 'ordinamento' ? (
        <div className="space-y-4 animate-in fade-in">
           <div className="bg-blue-50 border border-blue-100 p-4 sm:p-5 rounded-2xl">
               <h3 className="text-blue-800 font-bold mb-1 flex items-center gap-2"><ListOrdered size={20} /> Ordine di Visualizzazione</h3>
               <p className="text-sm text-blue-700 leading-relaxed">
                  Usa le frecce per modificare l'ordine degli articoli mostrati nel modulo Housekeeping. Questo ordine modificherà l'impaginazione dei prodotti sia all'interno delle categorie, sia la disposizione delle categorie stesse!
               </p>
           </div>
           
           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
             {loading ? (
                <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-gray-300" size={32} /></div>
             ) : housekeepingItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500 font-medium">Nessun articolo per Housekeeping.</div>
             ) : (
                <div className="divide-y divide-gray-100">
                  {housekeepingItems.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between p-3 sm:px-6 hover:bg-gray-50 transition">
                       <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center justify-center gap-1">
                             <button
                               onClick={() => handleMoveOrder(index, -1)}
                               disabled={index === 0 || saving}
                               className="p-1 sm:p-1.5 bg-gray-100 hover:bg-white border-transparent border hover:border-gray-200 text-gray-500 hover:text-blue-600 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed"
                             >
                               <ArrowUp size={16} />
                             </button>
                             <button
                               onClick={() => handleMoveOrder(index, 1)}
                               disabled={index === housekeepingItems.length - 1 || saving}
                               className="p-1 sm:p-1.5 bg-gray-100 hover:bg-white border-transparent border hover:border-gray-200 text-gray-500 hover:text-blue-600 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed"
                             >
                               <ArrowDown size={16} />
                             </button>
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{item.name}</div>
                            <div className="text-xs text-gray-500 font-semibold">{item.category}</div>
                          </div>
                       </div>
                       <div className="text-xl font-black text-gray-300">
                          #{index + 1}
                       </div>
                    </div>
                  ))}
                </div>
             )}
           </div>
        </div>
      ) : null}
    </div>
  );
}
