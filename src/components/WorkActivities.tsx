import React, { useState, useEffect, useMemo } from 'react';
import { getWorkActivities, addWorkActivity, updateWorkActivity, unliquidateWorkActivity, deleteWorkActivity, liquidateWorkActivities, updateAppSettings, AppSettings } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { useAuthContext } from './Auth';
import { WorkActivity } from '../types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Plus, Trash2, Edit2, Filter, Settings as SettingsIcon, Briefcase, CheckCircle, Clock, X, RotateCcw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function SettingsModal({ 
  onClose, 
  initialSettings, 
  onSave 
}: { 
  onClose: () => void; 
  initialSettings: AppSettings; 
  onSave: (settings: AppSettings) => Promise<void>; 
}) {
  const [workCats, setWorkCats] = useState<string[]>(initialSettings.workCategories || []);
  const [newWorkCat, setNewWorkCat] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddCat = () => {
    if (newWorkCat.trim() && !workCats.includes(newWorkCat.trim())) {
      setWorkCats([...workCats, newWorkCat.trim()]);
      setNewWorkCat('');
    }
  };

  const handleRemoveCat = (cat: string) => {
    setWorkCats(workCats.filter(c => c !== cat));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ ...initialSettings, workCategories: workCats });
      onClose();
    } catch(err) {
      alert("Errore salvataggio impostazioni");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
             <SettingsIcon className="text-gray-600"/> Impostazioni Competenze
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24}/></button>
        </div>
        
         <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <div className="space-y-3">
             <h3 className="font-bold text-blue-800 text-sm">Causali Attività</h3>
             <div className="flex gap-2">
                <input value={newWorkCat} onChange={e=>setNewWorkCat(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&handleAddCat()} placeholder="Nuova causale..." className="flex-1 p-2 text-sm border border-gray-300 rounded-lg"/>
                <button onClick={handleAddCat} className="px-3 bg-blue-100 text-blue-700 rounded-lg shrink-0">Aggiungi</button>
             </div>
             <div className="flex flex-wrap gap-2">
                {workCats.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-800">
                     {c} <button onClick={()=>handleRemoveCat(c)} className="text-blue-500 hover:text-red-500"><X size={12}/></button>
                  </span>
                ))}
             </div>
          </div>
        </div>
        
        <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">Annulla</button>
          <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2">
            {isSaving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkActivities() {
  const { settings } = useSettings();
  const { isAdmin } = useAuthContext();
  const [activities, setActivities] = useState<WorkActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLiquidationModalOpen, setIsLiquidationModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<WorkActivity | null>(null);

  // Filters
  const APARTMENTS = settings.apartments;
  const [filterApartment, setFilterApartment] = useState<string>('Tutti');
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterStartDate, setFilterStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterEndDate, setFilterEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterProperty, setFilterProperty] = useState<string>('Tutti');

  // Form State
  const [transactionDate, setTransactionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [liquidationDate, setLiquidationDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [apartment, setApartment] = useState<string>(APARTMENTS[0] || '');
  const [category, setCategory] = useState<string>(settings.workCategories[0] || '');
  const [customCategory, setCustomCategory] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [hoursStr, setHoursStr] = useState('');
  const [description, setDescription] = useState('');

  // Liquidation Modal State
  const [liquidationStartDate, setLiquidationStartDate] = useState('');
  const [liquidationEndDate, setLiquidationEndDate] = useState('');
  const [liquidationCategory, setLiquidationCategory] = useState('');
  const [liquidationCustomCategory, setLiquidationCustomCategory] = useState('');
  const [liquidationApartment, setLiquidationApartment] = useState('');
  const [liquidationProperty, setLiquidationProperty] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleNetworkOnline = () => {
      loadData();
    };
    window.addEventListener('app-network-online', handleNetworkOnline);
    return () => window.removeEventListener('app-network-online', handleNetworkOnline);
  }, []);

  useEffect(() => {
    setFilterApartment('Tutti');
  }, [filterProperty]);

  const loadData = async () => {
    setIsLoading(true);
    const data = await getWorkActivities();
    setActivities(data);
    setIsLoading(false);
  };

  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      if (filterApartment !== 'Tutti' && act.apartment !== filterApartment) return false;
      if (filterStatus !== 'Tutti' && act.status !== filterStatus) return false;
      
      if (filterProperty !== 'Tutti') {
         if (act.property && act.property !== filterProperty) return false;
         // Se non ha property (record vecchi non migrati), fallback sulla logica base:
         if (!act.property) {
           const apts = settings.propertyApartments[filterProperty] || [];
           if (!apts.includes(act.apartment)) return false;
         }
      }
      
      const txDate = format(act.date, 'yyyy-MM-dd');
      if (filterStartDate && txDate < filterStartDate) return false;
      if (filterEndDate && txDate > filterEndDate) return false;
      
      return true;
    });
  }, [activities, filterApartment, filterStatus, filterStartDate, filterEndDate, filterProperty, settings]);

  const totalPending = useMemo(() => {
    return filteredActivities.filter(a => a.status === 'pending').reduce((acc, a) => acc + a.amount, 0);
  }, [filteredActivities]);

  const totalLiquidated = useMemo(() => {
    return filteredActivities.filter(a => a.status === 'liquidated').reduce((acc, a) => acc + a.amount, 0);
  }, [filteredActivities]);

  const handleOpenLiquidation = () => {
    const pendingWork = filteredActivities.filter(a => a.status === 'pending');
    if (pendingWork.length === 0) return;
    
    pendingWork.sort((a,b) => a.date.getTime() - b.date.getTime());
    const firstDate = pendingWork[0].date;
    const lastDate = pendingWork[pendingWork.length - 1].date;
    
    // Inizio settimana (Lunedì) basato sulla prima data
    const startDay = firstDate.getDay();
    const diffToMonday = firstDate.getDate() - startDay + (startDay === 0 ? -6 : 1);
    const monday = new Date(firstDate);
    monday.setDate(diffToMonday);
    
    // Fine settimana (Domenica) basato sull'ultima data
    const lastDay = lastDate.getDay();
    const diffToSunday = lastDate.getDate() - lastDay + (lastDay === 0 ? 0 : 7);
    const sunday = new Date(lastDate);
    sunday.setDate(diffToSunday);
    
    const defaultLiqDate = new Date(sunday);
    defaultLiqDate.setDate(defaultLiqDate.getDate() + 1);
    
    setLiquidationStartDate(format(monday, 'yyyy-MM-dd'));
    setLiquidationEndDate(format(sunday, 'yyyy-MM-dd'));
    setLiquidationDate(format(defaultLiqDate, 'yyyy-MM-dd'));
    
    const defaultCat = settings.expenseCategories.includes('Pagamento Pulizie') ? 'Pagamento Pulizie' : (settings.expenseCategories[0] || '');
    setLiquidationCategory(defaultCat);
    setLiquidationCustomCategory('');
    setLiquidationProperty('Auto');
    setLiquidationApartment('Auto');
    
    setIsLiquidationModalOpen(true);
  };

  const confirmLiquidation = async () => {
    const pendingWork = filteredActivities.filter(a => a.status === 'pending');
    if (pendingWork.length === 0) return;
    
    setIsLoading(true);
    setIsLiquidationModalOpen(false);
    try {
      let finalCategory = liquidationCategory;
      if (liquidationCategory === 'Altro' && liquidationCustomCategory.trim()) {
        finalCategory = liquidationCustomCategory.trim();
        if (!settings.expenseCategories.includes(finalCategory)) {
          await updateAppSettings({ ...settings, expenseCategories: [...settings.expenseCategories, finalCategory] });
        }
      }
      
      const sDate = new Date(liquidationStartDate + 'T12:00:00');
      const eDate = new Date(liquidationEndDate + 'T12:00:00');
      const desc = `Attività svolte dal ${format(sDate, 'dd/MM/yy')} al ${format(eDate, 'dd/MM/yy')}`;
      const commonExpense = {
         date: new Date(liquidationDate + 'T12:00:00'),
         type: 'expense' as const,
         category: finalCategory,
         description: desc,
         isLiquidation: true
      };
      
      const liquidations: any[] = [];
      
      if (liquidationProperty !== 'Auto') {
        const totalAmount = pendingWork.reduce((acc, a) => acc + a.amount, 0);
        liquidations.push({
          workIds: pendingWork.map(w => w.id),
          activities: pendingWork,
          expenseDetails: {
            ...commonExpense,
            property: liquidationProperty,
            apartment: liquidationApartment !== 'Auto' ? liquidationApartment : '',
            amount: totalAmount
          }
        });
      } else {
        // Divide automaticamente per Proprietà in base alle attività selezionate
        const byProperty = pendingWork.reduce((acc, work) => {
           const prop = work.property || settings.apartmentProperty[work.apartment] || 'Sconosciuta';
           if (!acc[prop]) acc[prop] = { workIds: [], amount: 0 };
           acc[prop].workIds.push(work.id);
           acc[prop].amount += work.amount;
           return acc;
        }, {} as Record<string, { workIds: string[], amount: number }>);
        
        for (const [prop, dataAny] of Object.entries(byProperty)) {
           const data = dataAny as { workIds: string[], amount: number };
           liquidations.push({
             workIds: data.workIds,
             activities: pendingWork.filter(w => data.workIds.includes(w.id)),
             expenseDetails: {
               ...commonExpense,
               property: prop,
               apartment: liquidationApartment !== 'Auto' ? liquidationApartment : '',
               amount: data.amount
             }
           });
        }
      }
      
      await liquidateWorkActivities(liquidations);
      await loadData();
    } catch (error: any) {
      setError(error.message || 'Errore durante la liquidazione');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTransactionDate(format(new Date(), 'yyyy-MM-dd'));
    setApartment(APARTMENTS[0] || '');
    setCategory(settings.workCategories[0] || '');
    setCustomCategory('');
    setAmountStr('');
    setHoursStr('');
    setDescription('');
    setEditingActivity(null);
  };

  const handleOpenEdit = (act: WorkActivity) => {
    setEditingActivity(act);
    setTransactionDate(format(act.date, 'yyyy-MM-dd'));
    setApartment(act.apartment);
    setCategory(act.category);
    setCustomCategory('');
    setAmountStr(act.amount.toString());
    setHoursStr(act.hours ? act.hours.toString() : '');
    setDescription(act.description || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      alert("Inserire un importo valido."); return;
    }
    const parsedHours = hoursStr !== '' ? parseFloat(hoursStr) : undefined;
    if (parsedHours !== undefined && (isNaN(parsedHours) || parsedHours < 0)) {
      alert("Inserire un numero di ore valido."); return;
    }

    setIsSubmitting(true);
    try {
      let finalCategory = category;
      if (category === 'Altro' && customCategory.trim() !== '') {
        finalCategory = customCategory.trim();
        if (!settings.workCategories.includes(finalCategory)) {
          await updateAppSettings({ ...settings, workCategories: [...settings.workCategories, finalCategory] });
        }
      }

      if (editingActivity) {
         let payload: any = {
           apartment: apartment || '',
           date: new Date(transactionDate + 'T12:00:00'),
           category: finalCategory,
           amount: parsedAmount,
           description,
         };
         if (parsedHours !== undefined) {
             payload.hours = parsedHours;
         } else {
             // In firebase we can't just send undefined to remove it, but since we don't have deleteField imported 
             // here we can just update the rest. Or send an empty description. Wait, if it was defined before, it won't be cleared.
             // But actually omitting it is fine for Firestore.
         }

         await updateWorkActivity(editingActivity.id, payload, editingActivity);
      } else {
         let payload: any = {
           apartment,
           property: apartment ? settings.apartmentProperty[apartment] : undefined,
           date: new Date(transactionDate + 'T12:00:00'),
           category: finalCategory,
           amount: parsedAmount,
           description,
           status: 'pending'
         };
         if (parsedHours !== undefined) {
             payload.hours = parsedHours;
         }
         await addWorkActivity(payload);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Errore durante il salvataggio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Sei sicuro di voler eliminare questa attività?")) {
      try {
        await deleteWorkActivity(id);
        loadData();
      } catch (err: any) {
        setError(err.message || 'Errore eliminazione');
      }
    }
  };

  const handleUnliquidate = async (activity: WorkActivity) => {
    if (window.confirm('Riportare questa attività nello stato "Da Liquidare"?')) {
      try {
        await unliquidateWorkActivity(activity.id, activity);
        await loadData();
      } catch (err: any) {
        setError(err.message || 'Errore');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competenze e Servizi</h1>
          <p className="text-gray-500 text-sm mt-1">Gestisci pulizie, manutenzioni e altre attività</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isAdmin && (
            <button
               onClick={() => setIsSettingsOpen(true)}
               className="p-2.5 text-gray-600 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 transition"
               title="Impostazioni Causali"
            >
               <SettingsIcon size={20} />
            </button>
          )}
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition font-medium shadow-sm"
          >
            <Plus size={20} /> <span className="hidden sm:inline">Nuova Attività</span><span className="sm:hidden">Nuova</span>
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
         <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center relative">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
              <Clock size={24} />
            </div>
            <div className="mb-2">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Da Liquidare (filtrati)</p>
              <p className="text-2xl font-black text-gray-900">€{totalPending.toFixed(2)}</p>
            </div>
            {totalPending > 0 && isAdmin && (
              <button 
                onClick={handleOpenLiquidation}
                className="mt-2 w-full text-xs bg-orange-600 text-white font-bold px-3 py-2 rounded-xl shadow-sm transition hover:bg-orange-700 uppercase tracking-wider flex justify-center items-center gap-1"
              >
                Liquida Selezionati
              </button>
            )}
         </div>
         <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Liquidato</p>
              <p className="text-2xl font-black text-gray-900">€{totalLiquidated.toFixed(2)}</p>
            </div>
         </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center gap-2 mb-2 text-gray-800 font-semibold text-sm">
           <Filter size={16} /> Filtri
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Data Inizio</label>
            <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Data Fine</label>
            <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Stato</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutti">Tutti</option>
               <option value="pending">Da Liquidare</option>
               <option value="liquidated">Liquidati</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Proprietà</label>
            <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutti">Tutte</option>
               {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Appartamento</label>
            <select value={filterApartment} onChange={e => setFilterApartment(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutti">Tutti</option>
               {APARTMENTS.filter(a => filterProperty === 'Tutti' || (settings.propertyApartments[filterProperty] || []).includes(a)).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* List - Desktop */}
      <div className="hidden md:block bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-fixed">
              <thead className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase text-gray-500 font-semibold tracking-wider">
                <tr>
                   <th className="px-3 py-2 w-28">Data</th>
                   <th className="px-3 py-2 w-32">Appt.</th>
                   <th className="px-3 py-2 w-32">Categoria</th>
                   <th className="px-3 py-2">Dettagli</th>
                   <th className="px-3 py-2 w-24 text-right">Importo</th>
                   <th className="px-3 py-2 w-28 text-center">Stato</th>
                   <th className="px-3 py-2 w-16 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredActivities.length === 0 ? (
                  <tr><td colSpan={7} className="p-4 text-center text-gray-400 text-sm">Nessuna attività trovata</td></tr>
                ) : filteredActivities.map((act) => (
                     <tr key={act.id} className="hover:bg-gray-50/50">
                       <td className="px-3 py-2 text-xs text-gray-500 align-middle whitespace-nowrap">{format(act.date, 'dd/MM/yyyy')}</td>
                       <td className="px-3 py-2 text-xs font-medium text-gray-900 align-middle">{act.apartment}</td>
                       <td className="px-3 py-2 text-xs font-semibold align-middle truncate">
                         {act.category}
                       </td>
                       <td className="px-3 py-2 text-xs text-gray-600 align-middle break-words leading-tight">
                         {act.description || '-'}
                       </td>
                       <td className="px-3 py-2 text-xs font-bold text-gray-900 align-middle text-right whitespace-nowrap">
                          €{act.amount.toFixed(2)}
                       </td>
                       <td className="px-3 py-2 align-middle text-center">
                          {act.status === 'pending' ? (
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-[10px] font-bold uppercase tracking-wider">
                                <Clock size={10}/> Da Liquidare
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider">
                                <CheckCircle size={10}/> Liquidato
                             </span>
                          )}
                       </td>
                       <td className="px-3 py-2 align-middle text-right">
                          <div className="flex justify-end gap-1">
                             {act.status === 'liquidated' && isAdmin && (
                                <button onClick={() => handleUnliquidate(act)} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded" title="Annulla Liquidazione">
                                  <RotateCcw size={14} />
                                </button>
                             )}
                             <button onClick={() => handleOpenEdit(act)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Modifica">
                               <Edit2 size={14} />
                             </button>
                             {isAdmin && (
                                <button onClick={() => handleDelete(act.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Elimina">
                                  <Trash2 size={14} />
                                </button>
                             )}
                          </div>
                       </td>
                     </tr>
                ))}
              </tbody>
            </table>
         </div>
      </div>

      {/* List - Mobile */}
      <div className="md:hidden space-y-2">
         {filteredActivities.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm shadow-sm">
                Nessuna attività trovata
            </div>
         ) : filteredActivities.map((act) => (
            <div key={act.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex gap-3">
               <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${act.status === 'liquidated' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                  {act.status === 'liquidated' ? <CheckCircle size={16} /> : <Clock size={16} />}
               </div>
               
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                     <div className="flex flex-col leading-tight">
                        <span className="text-[10px] text-gray-500 font-medium">{format(act.date, 'dd/MM/yyyy')}</span>
                        <span className="text-xs font-bold text-gray-900">{act.apartment}</span>
                     </div>
                     <span className="text-sm font-black text-gray-900">
                        €{act.amount.toFixed(2)}
                     </span>
                  </div>
                  
                  <div className="text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded inline-block mb-1">
                     {act.category} {act.hours ? `- ${act.hours}h` : ''}
                  </div>
                  
                  {act.description && (
                     <div className="text-[11px] text-gray-600 mt-0.5">
                        {act.description}
                     </div>
                  )}

                  <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-50">
                      {act.status === 'liquidated' && isAdmin && (
                         <button onClick={() => handleUnliquidate(act)} className="p-1 px-3 text-xs bg-orange-50 text-orange-700 font-medium rounded-lg hover:bg-orange-100 flex items-center gap-1">
                            <RotateCcw size={12}/> Annulla
                         </button>
                      )}
                      <button onClick={() => handleOpenEdit(act)} className="p-1 px-3 text-xs bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200">Modifica</button>
                      {isAdmin && <button onClick={() => handleDelete(act.id)} className="p-1 px-3 text-xs bg-red-50 text-red-700 font-medium rounded-lg hover:bg-red-100">Elimina</button>}
                  </div>
               </div>
            </div>
         ))}
      </div>

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                 <Briefcase className="text-blue-600" />
                 {editingActivity ? 'Modifica Attività' : 'Nuova Attività'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                   <input required type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Appartamento</label>
                   <select value={apartment} onChange={e => setApartment(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      {APARTMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (Causale)</label>
                   <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      {settings.workCategories.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                   {category === 'Altro' && (
                     <input 
                       type="text" required placeholder="Specifica nuova causale..." 
                       value={customCategory} onChange={e => setCustomCategory(e.target.value)} 
                       className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-blue-50"
                     />
                   )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Ore (opzionale)</label>
                   <input type="number" step="0.5" min="0" value={hoursStr} onChange={e => setHoursStr(e.target.value)} className="w-full p-3 text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Es. 4" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Importo (€)</label>
                   <input required type="number" step="0.01" min="0" value={amountStr} onChange={e => setAmountStr(e.target.value)} className="w-full p-3 text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                </div>
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione (opzionale)</label>
                 <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]" placeholder="Dettagli attività..." />
              </div>

              <div className="pt-4 border-t border-gray-100 flex gap-3">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 p-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition font-medium">Annulla</button>
                 <button type="submit" disabled={isSubmitting} className="flex-1 p-3 text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition font-bold disabled:opacity-50">
                    {isSubmitting ? 'In corso...' : 'Salva Attività'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLiquidationModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
               <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Briefcase className="text-blue-600" />
                  Conferma Liquidazione
               </h2>
               <button onClick={() => setIsLiquidationModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition"><X size={24} /></button>
            </div>
            
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
               <p className="text-sm text-gray-600 break-words">
                 Stai per liquidare <strong>{filteredActivities.filter(a => a.status === 'pending').length}</strong> attività per un totale di <strong>€{totalPending.toFixed(2)}</strong>.
               </p>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Inizio Periodo</label>
                    <input type="date" value={liquidationStartDate} onChange={e => setLiquidationStartDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fine Periodo</label>
                    <input type="date" value={liquidationEndDate} onChange={e => setLiquidationEndDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 truncate" title="Proprietà">Proprietà</label>
                    <select value={liquidationProperty} onChange={e => {
                        setLiquidationProperty(e.target.value);
                        if (e.target.value === 'Auto') setLiquidationApartment('Auto');
                    }} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                       <option value="Auto">Auto (Dividi per Proprietà)</option>
                       {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 truncate" title="Appartamento">Appartamento</label>
                    <select value={liquidationApartment} onChange={e => setLiquidationApartment(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                       <option value="Auto">Tutti</option>
                       {(liquidationProperty === 'Auto' ? APARTMENTS : (settings.propertyApartments[liquidationProperty] || [])).map(apt => (
                         <option key={apt} value={apt}>{apt}</option>
                       ))}
                    </select>
                  </div>
               </div>
               
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 truncate" title="Categoria (Uscita Cassa Centrale)">Categoria (Uscita Cassa Centrale)</label>
                  <select value={liquidationCategory} onChange={e => setLiquidationCategory(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                     {settings.expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                     <option value="Altro">Altro (Specifica)</option>
                  </select>
                  {liquidationCategory === 'Altro' && (
                     <input 
                       type="text" required placeholder="Specifica nuova causale..." 
                       value={liquidationCustomCategory} onChange={e => setLiquidationCustomCategory(e.target.value)} 
                       className="mt-2 w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-blue-50"
                     />
                  )}
               </div>

               <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Registrazione (Cassa)</label>
                  <input type="date" value={liquidationDate} onChange={e => setLiquidationDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
               </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-100 flex gap-3 bg-gray-50 shrink-0">
               <button type="button" onClick={() => setIsLiquidationModalOpen(false)} className="flex-1 p-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium">Annulla</button>
               <button type="button" onClick={confirmLiquidation} disabled={isLoading} className="flex-1 p-3 text-white bg-orange-600 rounded-xl hover:bg-orange-700 transition font-bold disabled:opacity-50">
                  {isLoading ? 'In corso...' : 'Conferma'}
               </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)}
          initialSettings={settings}
          onSave={updateAppSettings}
        />
      )}
    </div>
  );
}
