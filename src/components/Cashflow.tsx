import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getCashflows, addCashflow, updateCashflow, getCashflowLogs, deleteCashflow, getItems, updateAppSettings, AppSettings, getWorkActivitiesByLiquidationId, deleteLiquidationCashflow } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { useAuthContext } from './Auth';
import { Cashflow, Item, CashflowLog, WorkActivity } from '../types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Plus, Trash2, TrendingUp, TrendingDown, FileText, Image as ImageIcon, Camera, Filter, FileSpreadsheet, FileIcon as FilePdf, Wallet, X, Settings as SettingsIcon, Settings2, Share2 } from 'lucide-react';
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
  const [incomeCats, setIncomeCats] = useState<string[]>(initialSettings.incomeCategories);
  const [expenseCats, setExpenseCats] = useState<string[]>(initialSettings.expenseCategories);
  const [newIncomeCat, setNewIncomeCat] = useState('');
  const [newExpenseCat, setNewExpenseCat] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddCat = (type: 'income'|'expense') => {
    if (type === 'income' && newIncomeCat.trim() && !incomeCats.includes(newIncomeCat.trim())) {
      setIncomeCats([...incomeCats, newIncomeCat.trim()]);
      setNewIncomeCat('');
    } else if (type === 'expense' && newExpenseCat.trim() && !expenseCats.includes(newExpenseCat.trim())) {
      setExpenseCats([...expenseCats, newExpenseCat.trim()]);
      setNewExpenseCat('');
    }
  };

  const handleRemoveCat = (type: 'income'|'expense', cat: string) => {
    if (type === 'income') setIncomeCats(incomeCats.filter(c => c !== cat));
    else setExpenseCats(expenseCats.filter(c => c !== cat));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ ...initialSettings, incomeCategories: incomeCats, expenseCategories: expenseCats });
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
             <SettingsIcon className="text-gray-600"/> Impostazioni Causali
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24}/></button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <div className="space-y-3">
             <h3 className="font-bold text-blue-800 text-sm">Causali Entrate</h3>
             <div className="flex gap-2">
                <input value={newIncomeCat} onChange={e=>setNewIncomeCat(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&handleAddCat('income')} placeholder="Nuova causale..." className="flex-1 p-2 text-sm border border-gray-300 rounded-lg"/>
                <button onClick={()=>handleAddCat('income')} className="px-3 bg-blue-100 text-blue-700 rounded-lg shrink-0">Aggiungi</button>
             </div>
             <div className="flex flex-wrap gap-2">
                {incomeCats.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-800">
                     {c} <button onClick={()=>handleRemoveCat('income', c)} className="text-blue-500 hover:text-red-500"><X size={12}/></button>
                  </span>
                ))}
             </div>
          </div>

          <div className="space-y-3">
             <h3 className="font-bold text-amber-800 text-sm">Causali Uscite</h3>
             <div className="flex gap-2">
                <input value={newExpenseCat} onChange={e=>setNewExpenseCat(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&handleAddCat('expense')} placeholder="Nuova causale..." className="flex-1 p-2 text-sm border border-gray-300 rounded-lg"/>
                <button onClick={()=>handleAddCat('expense')} className="px-3 bg-amber-100 text-amber-700 rounded-lg shrink-0">Aggiungi</button>
             </div>
             <div className="flex flex-wrap gap-2">
                {expenseCats.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-xs font-semibold text-amber-800">
                     {c} <button onClick={()=>handleRemoveCat('expense', c)} className="text-amber-500 hover:text-red-500"><X size={12}/></button>
                  </span>
                ))}
             </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
           <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition text-sm">Annulla</button>
           <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 bg-gray-900 text-white font-bold rounded-xl shadow-md hover:bg-black transition text-sm disabled:opacity-50">
             Salva Causali
           </button>
        </div>
      </div>
    </div>
  );
}

function CashflowLogsModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<CashflowLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCashflowLogs().then(data => {
      setLogs(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
             <FileText className="text-gray-600"/> Log Modifiche
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24}/></button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto w-full">
           {loading ? (
             <div className="text-center py-10 text-gray-400">Caricamento log...</div>
           ) : logs.length === 0 ? (
             <div className="text-center py-10 text-gray-400">Nessuna modifica registrata.</div>
           ) : (
             <div className="space-y-4">
               {logs.map((log) => (
                 <div key={log.id} className="p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm">
                   <div className="flex justify-between mb-2">
                     <span className="font-bold text-gray-700">{log.modifiedBy}</span>
                     <span className="text-gray-500">{format(log.timestamp, 'dd/MM/yyyy HH:mm')}</span>
                   </div>
                   <div className="text-xs text-gray-500 mb-1">Causale Originale ID: {log.cashflowId}</div>
                   <div className="text-gray-700 font-mono text-xs bg-white p-2 border border-gray-200 rounded break-all">
                     {log.changes}
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

export function CashflowManager() {
  const { isAdmin, permissions } = useAuthContext();
  const canEdit = isAdmin || permissions?.cashflowEdit;
  
  const { settings, loading: settingsLoading } = useSettings();
  const { properties: PROPERTIES, apartments: APARTMENTS, propertyApartments: PROPERTY_APARTMENTS, apartmentProperty: APARTMENT_PROPERTY } = settings;
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const getWineName = (itemId: string) => items.find((i: Item) => i.id === itemId)?.name || 'Vino rimosso';
  
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [editingCashflow, setEditingCashflow] = useState<Cashflow | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Liquidation Details Modal
  const [liquidationDetailsId, setLiquidationDetailsId] = useState<string | null>(null);
  const [liquidationActivities, setLiquidationActivities] = useState<WorkActivity[]>([]);
  const [isLiquidationLoading, setIsLiquidationLoading] = useState(false);

  // Filters
  const [filterProperty, setFilterProperty] = useState<string>('Tutte');
  const [filterApartment, setFilterApartment] = useState<string>('Tutti');
  const [filterType, setFilterType] = useState<string>('Tutti');
  const [filterCategory, setFilterCategory] = useState<string>('Tutti');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportColumns, setExportColumns] = useState({
    date: true,
    location: true,
    category: true,
    details: true,
    inOut: true,
    progressive: true,
    liquidationDetails: false,
    liquidationOperator: false
  });
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleColumn = (key: keyof typeof exportColumns) => {
    setExportColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Form
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [transactionDate, setTransactionDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [apartment, setApartment] = useState<string>('');
  const [property, setProperty] = useState<string>('');
  const [category, setCategory] = useState<string>(settings.incomeCategories[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  
  // Wine/Items
  const [selectedWines, setSelectedWines] = useState<{wineId: string, quantity: number}[]>([]);
  const [currentWineId, setCurrentWineId] = useState<string>('');
  const [currentWineQuantity, setCurrentWineQuantity] = useState(1);

  // Parking days (util)
  const [parkingDays, setParkingDays] = useState(1);

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

  const isLiq = (cf: Cashflow) => {
     return cf.isLiquidation || cf.category === 'Pagamento Pulizie' || !!(cf.description && (cf.description.toLowerCase().includes('liquidazione') || cf.description.toLowerCase().includes('compensi') || cf.description.toLowerCase().includes('attività svolte')));
  };

  async function loadData() {
    setIsLoading(true);
    try {
      const [allCf, allItems] = await Promise.all([getCashflows(), getItems()]);
      setCashflows(allCf);
      setItems(allItems);
    } catch (err: any) {
      setError(err.message || "Errore nel caricamento dei flussi di cassa");
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Form Logic
  useEffect(() => {
    if (type === 'income') {
      if (!settings.incomeCategories?.includes(category)) setCategory(settings.incomeCategories?.[0] || '');
    } else {
      if (!settings.expenseCategories?.includes(category)) setCategory(settings.expenseCategories?.[0] || '');
    }
  }, [type, settings]);

  // Derived Parking and Wine prices
  useEffect(() => {
    if (category === 'Parking') {
      const pricePerDay = (apartment === 'Sunrise') ? 10 : 15;
      setAmountStr((pricePerDay * parkingDays).toString());
    } else if (category === 'Vendita Vino') {
      const pricePerBottle = 10;
      const totalQuantity = selectedWines.reduce((sum, w) => sum + w.quantity, 0);
      if (totalQuantity > 0) {
        setAmountStr((pricePerBottle * totalQuantity).toString());
      }
    }
  }, [category, apartment, parkingDays, selectedWines]);


  const handleShareImage = async (base64Url: string) => {
    if (!base64Url) return;

    try {
      const response = await fetch(base64Url);
      const blob = await response.blob();
      const file = new File([blob], 'ricevuta.jpg', { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Ricevuta',
          text: 'Ricevuta condivisa da HyperFlow',
          files: [file]
        });
      } else {
        alert("La condivisione diretta non è supportata su questo dispositivo o browser.");
      }
    } catch (error) {
      console.error("Errore nella condivisione:", error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Max dimensions to shrink down heavy photos
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Compress as JPEG with 0.6 quality
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          
          if (compressedBase64.length > 850000) {
            alert("L'immagine è ancora troppo grande dopo la compressione (supera i 850KB limitati). Riprova con un'immagine più semplice o di dimensioni inferiori.");
            return;
          }
          
          setReceiptUrl(compressedBase64);
        } else {
           setReceiptUrl(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      alert("Inserire un importo valido."); return;
    }

    if (category === 'Vendita Vino' && apartment === 'Sunrise') {
      alert("La vendita di vino è supportata solo per Namaste e Buk."); return;
    }

    if (category === 'Vendita Vino' && !editingCashflow && selectedWines.length === 0) {
       alert("Devi selezionare almeno un vino."); return;
    }

    setIsSubmitting(true);
    try {
      let finalCategory = category;
      if (category === 'Altro' && customCategory.trim() !== '') {
        finalCategory = customCategory.trim();
        // Aggiungi ai setting in modo permanente
        if (type === 'income' && !settings.incomeCategories.includes(finalCategory)) {
          await updateAppSettings({ ...settings, incomeCategories: [...settings.incomeCategories, finalCategory] });
        } else if (type === 'expense' && !settings.expenseCategories.includes(finalCategory)) {
          await updateAppSettings({ ...settings, expenseCategories: [...settings.expenseCategories, finalCategory] });
        }
      }

      const resolvedProperty = property || (apartment ? (settings.apartmentProperty as Record<string, string>)[apartment] : undefined);
      const cashflowData: any = {
        apartment,
        date: new Date(transactionDate + 'T12:00:00'),
        type,
        category: finalCategory,
        amount: parsedAmount,
        description,
        receiptUrl,
        ...(finalCategory === 'Vendita Vino' ? { items: selectedWines.map(w => ({ itemId: w.wineId, quantity: w.quantity })) } : {})
      };
      if (resolvedProperty) {
        cashflowData.property = resolvedProperty;
      }

      if (editingCashflow) {
         await updateCashflow(editingCashflow.id, cashflowData, editingCashflow);
      } else {
         await addCashflow(cashflowData);
      }
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch(err: any) {
      alert(err.message || 'Errore nel salvataggio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTransactionDate(format(new Date(), 'yyyy-MM-dd'));
    setType('income');
    setProperty('');
    setApartment(APARTMENTS[0]);
    setCategory(settings.incomeCategories[0] || '');
    setCustomCategory('');
    setAmountStr('');
    setDescription('');
    setReceiptUrl('');
    setSelectedWines([]);
    setCurrentWineId('');
    setCurrentWineQuantity(1);
    setParkingDays(1);
    setEditingCashflow(null);
  };

  const handleViewLiquidationDetails = async (id: string) => {
    setLiquidationDetailsId(id);
    setIsLiquidationLoading(true);
    try {
      const activities = await getWorkActivitiesByLiquidationId(id);
      setLiquidationActivities(activities);
    } catch (err: any) {
      setError(err.message || "Errore nel caricamento dei dettagli");
    } finally {
      setIsLiquidationLoading(false);
    }
  };

  const handleEditCashflow = (cf: Cashflow) => {
    setEditingCashflow(cf);
    setTransactionDate(format(cf.date, 'yyyy-MM-dd'));
    setType(cf.type);
    setProperty(cf.property || '');
    setApartment(cf.apartment || '');
    setCategory(cf.category);
    setAmountStr(cf.amount.toString());
    setDescription(cf.description || '');
    setReceiptUrl(cf.receiptUrl || '');
    if (cf.items && cf.items.length > 0) {
      setSelectedWines(cf.items.map(i => ({ wineId: i.itemId, quantity: i.quantity })));
    } else if (cf.itemId) {
      setSelectedWines([{ wineId: cf.itemId, quantity: cf.itemQuantity || 1 }]);
    } else {
      setSelectedWines([]);
    }
    setCurrentWineId('');
    setCurrentWineQuantity(1);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, isLiquidation?: boolean) => {
    try {
      if (isLiquidation) {
        if (confirm("ATTENZIONE: Questa è una liquidazione. Eliminandola, tutte le attività associate torneranno allo stato 'Da Liquidare'. Vuoi procedere?")) {
          const result = await deleteLiquidationCashflow(id);
          loadData();
          if (result && result.activitiesReverted === 0) {
            alert("Operazione eliminata, ma NON è stata trovata alcuna attività associata da stornare (forse era una registrazione manuale o molto vecchia).");
          }
        }
      } else {
        if (confirm("Vuoi davvero eliminare questa registrazione?")) {
          await deleteCashflow(id);
          loadData();
        }
      }
    } catch (e: any) {
      setError(e.message || "Errore durante l'eliminazione");
    }
  };


  const handleFilterApartmentChange = (ap: string) => {
    setFilterApartment(ap);
  };

  const handleFilterPropertyChange = (prop: string) => {
    setFilterProperty(prop);
    setFilterApartment('Tutti');
  };

  // Calcolo ripresa saldi (Saldo contabile precedente alla data iniziale filtrata)
  const initialBalance = useMemo(() => {
    if (!filterStartDate) return 0;
    let init = 0;
    cashflows.forEach(cf => {
      // Basic filters
      if (filterApartment !== 'Tutti' && cf.apartment !== filterApartment) return;
      if (filterType !== 'Tutti' && cf.type !== filterType) return;
      if (filterCategory !== 'Tutti' && cf.category !== filterCategory) return;
      
      // Property filter
      if (filterProperty !== 'Tutte') {
        const prop = cf.property;
        if (prop !== filterProperty) return;
      }

      const cfDateStr = format(cf.date, 'yyyy-MM-dd');
      if (cfDateStr < filterStartDate) {
        const amount = cf.amount || 0;
        if (cf.type === 'income') init += amount;
        else if (cf.type === 'expense' || cf.type === 'out') init -= amount;
      }
    });
    return init;
  }, [cashflows, filterApartment, filterType, filterCategory, filterProperty, filterStartDate]);

  // Filtering logic
  const filteredCashflows = useMemo(() => {
    const list = cashflows.filter(cf => {
      // Basic filters
      if (filterApartment !== 'Tutti' && cf.apartment !== filterApartment) return false;
      if (filterType !== 'Tutti' && cf.type !== filterType) return false;
      if (filterCategory !== 'Tutti' && cf.category !== filterCategory) return false;
      
      // Property filter
      if (filterProperty !== 'Tutte') {
        const prop = cf.property;
        if (prop !== filterProperty) return false;
      }

      const cfDateStr = format(cf.date, 'yyyy-MM-dd');
      if (filterStartDate && cfDateStr < filterStartDate) return false;
      if (filterEndDate && cfDateStr > filterEndDate) return false;
      
      return true;
    });

    // Compute progressive balance starting from initialBalance
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    let currentBalance = initialBalance;
    const withBalance = list.map(cf => {
      const amount = cf.amount || 0;
      if (cf.type === 'income') currentBalance += amount;
      else if (cf.type === 'expense' || cf.type === 'out') currentBalance -= amount;
      // Work type doesn't affect progressive physical balance until liquidated
      return { ...cf, progressiveBalance: currentBalance };
    });

    return withBalance;
  }, [cashflows, filterApartment, filterType, filterCategory, filterStartDate, filterEndDate, filterProperty, initialBalance]);

  // Calculations for Estratto Conto
  const { totalIncome, totalExpense, periodNet, finalBalance, balance } = useMemo(() => {
    let inc = 0; let exp = 0;
    filteredCashflows.forEach(cf => {
      if (cf.type === 'income') inc += (cf.amount || 0);
      else if (cf.type === 'expense' || cf.type === 'out') exp += (cf.amount || 0);
    });
    const net = inc - exp;
    const finBal = initialBalance + net;
    return {
      totalIncome: inc,
      totalExpense: exp,
      periodNet: net,
      finalBalance: finBal,
      balance: finBal
    };
  }, [filteredCashflows, initialBalance]);

  const formatDateStr = (dStr: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dStr;
  };

  const formatLocation = (cf: Cashflow) => {
    if (cf.property && cf.apartment) return `${cf.property} - ${cf.apartment}`;
    if (cf.property) return cf.property;
    if (cf.apartment) return cf.apartment;
    return '-';
  };

  const formatDisplayLocationHTML = (cf: Cashflow) => {
    return (
      <div className="flex flex-col">
        {cf.property && <span className="font-bold text-gray-900 leading-tight">{cf.property}</span>}
        {cf.apartment && <span className="text-[10px] text-gray-500 leading-tight">{cf.apartment}</span>}
        {!cf.property && !cf.apartment && <span>-</span>}
      </div>
    );
  };
  
  const formatDisplayLocationText = (cf: Cashflow) => {
    if (cf.property && cf.apartment) return `${cf.property}\n${cf.apartment}`;
    return cf.property || cf.apartment || '-';
  };

  const displayCashflows = [...filteredCashflows].reverse();

  const buildSimplifiedCashflows = async (cashflowsList: Cashflow[], startingBalance: number = 0) => {
    const detailsMap: Record<string, any[]> = {};
    const promises = cashflowsList
      .filter(cf => isLiq(cf) && cf.id)
      .map(async cf => {
        try {
          const acts = await getWorkActivitiesByLiquidationId(cf.id!);
          detailsMap[cf.id!] = acts;
        } catch(e) {}
      });
    await Promise.all(promises);

    const result: any[] = [];
    for (const cf of cashflowsList) {
       if (isLiq(cf) && cf.id && detailsMap[cf.id!] && detailsMap[cf.id!].length > 0) {
           const acts = detailsMap[cf.id!];
           for (const a of acts) {
              result.push({
                 ...cf,
                 id: cf.id + '_' + a.id,
                 date: a.date,
                 property: settings.apartmentProperty[a.apartment] || '',
                 apartment: a.apartment,
                 category: a.category,
                 operator: a.operator,
                 description: (a.description || '') + (a.hours ? ` (${a.hours}h)` : ''),
                 amount: a.amount || 0,
                 type: cf.type
              });
           }
       } else {
           result.push(cf);
       }
    }

    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    let runBal = startingBalance;
    let totInc = 0;
    let totExp = 0;
    const finalResult = [];
    for (const cf of result) {
       if (cf.type === 'income') { runBal += cf.amount; totInc += cf.amount; }
       else if (cf.type === 'expense' || cf.type === 'out') { runBal -= cf.amount; totExp += cf.amount; }
       
       finalResult.push({
          ...cf,
          progressiveBalance: runBal
       });
    }

    return {
      data: finalResult,
      totalIncome: totInc,
      totalExpense: totExp,
      periodNet: totInc - totExp,
      balance: runBal
    };
  };

  const exportPDFSimplified = async () => {
    setIsExporting(true);
    const { data: simplifiedData, totalIncome: sTotInc, totalExpense: sTotExp, balance: sBal } = await buildSimplifiedCashflows(filteredCashflows, initialBalance);

    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(18);
    const dateRangeStr = (filterStartDate || filterEndDate) 
      ? `Dal ${formatDateStr(filterStartDate) || 'Inizio'} Al ${formatDateStr(filterEndDate) || 'Oggi'}` 
      : 'Tutto lo storico';
    doc.text(`Estratto Conto Semplificato - ${dateRangeStr}`, 14, currentY);
    currentY += 8;
    
    doc.setFontSize(11);
    doc.text(`Proprietà: ${filterProperty} | Appartamento: ${filterApartment} | Categoria: ${filterCategory}`, 14, currentY);
    currentY += 6;

    if (filterStartDate) {
      doc.setFontSize(9.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Saldo Iniziale: € ${initialBalance.toFixed(2)}  |  Entrate: € ${sTotInc.toFixed(2)}  |  Uscite: € ${sTotExp.toFixed(2)}  |  Flusso Netto: € ${(sTotInc - sTotExp).toFixed(2)}  |  Saldo Finale: € ${sBal.toFixed(2)}`, 14, currentY);
      doc.setTextColor(0, 0, 0);
      currentY += 6;
    }

    const headRow = [];
    if (exportColumns.date) headRow.push('Data');
    if (exportColumns.location) headRow.push('Appt.');
    if (exportColumns.category) headRow.push('Categoria');
    headRow.push('Operatore');
    if (exportColumns.details) headRow.push('Dettagli');
    if (exportColumns.inOut) { headRow.push('Entrate'); headRow.push('Uscite'); }
    if (exportColumns.progressive) headRow.push('Prog.');

    const tableBody: any[] = [];

    // Riga iniziale di Ripresa Saldi se c'è una data iniziale filtrata
    if (filterStartDate) {
      const initRow = [];
      if (exportColumns.date) initRow.push(formatDateStr(filterStartDate));
      if (exportColumns.location) initRow.push('-');
      if (exportColumns.category) initRow.push('RIPRESA SALDI');
      initRow.push('-'); // Operatore
      if (exportColumns.details) initRow.push(`Saldo contabile iniziale precedente al ${formatDateStr(filterStartDate)}`);
      if (exportColumns.inOut) {
        initRow.push('-');
        initRow.push('-');
      }
      if (exportColumns.progressive) initRow.push(`€ ${initialBalance.toFixed(2)}`);
      tableBody.push(initRow);
    }

    simplifiedData.forEach(cf => {
      const row = [];
      if (exportColumns.date) row.push(format(cf.date, 'dd/MM/yyyy HH:mm'));
      if (exportColumns.location) row.push(formatDisplayLocationText(cf));
      if (exportColumns.category) row.push(cf.category);
      row.push((cf as any).operator || '');
      if (exportColumns.details) {
         let detailText = cf.description || '';
         if (cf.category === 'Vendita Vino') {
           if (cf.items && cf.items.length > 0) {
             const wineStr = `Vino venduto:\n` + cf.items.map((it: any) => `- ${getWineName(it.itemId)} (${it.quantity} pz)`).join('\n');
             detailText = detailText ? `${wineStr}\nNote: ${detailText}` : wineStr;
           } else if (cf.itemId) {
             const wineStr = `Vino venduto: ${getWineName(cf.itemId)} (${cf.itemQuantity || 1} pz)`;
             detailText = detailText ? `${wineStr} - ${detailText}` : wineStr;
           }
         }
         row.push(detailText);
      }
      if (exportColumns.inOut) {
        row.push(cf.type === 'income' ? `€ ${(cf.amount||0).toFixed(2)}` : '');
        row.push((cf.type === 'expense' || cf.type === 'out') ? `-€ ${(cf.amount||0).toFixed(2)}` : '');
      }
      if (exportColumns.progressive) row.push(`€ ${(cf as any).progressiveBalance?.toFixed(2) || '0.00'}`);
      tableBody.push(row);
    });

    const totalsRow = [];
    if (exportColumns.date) totalsRow.push(filterStartDate ? 'TOTALE PERIODO' : 'TOTALE');
    if (exportColumns.location) totalsRow.push('');
    if (exportColumns.category) totalsRow.push('');
    totalsRow.push('');
    if (exportColumns.details) totalsRow.push('');
    if (exportColumns.inOut) {
      totalsRow.push(`€ ${sTotInc.toFixed(2)}`);
      totalsRow.push(`-€ ${sTotExp.toFixed(2)}`);
    }
    if (exportColumns.progressive) totalsRow.push(`€ ${sBal.toFixed(2)}`);

    tableBody.push(totalsRow);

    const colStyles: any = {};
    let colIdx = 0;
    if (exportColumns.date) { colStyles[colIdx++] = { cellWidth: 22 }; }
    if (exportColumns.location) { colStyles[colIdx++] = { cellWidth: 22 }; }
    if (exportColumns.category) { colStyles[colIdx++] = { cellWidth: 26 }; }
    colStyles[colIdx++] = { cellWidth: 24 }; // Operatore
    if (exportColumns.details) { colStyles[colIdx++] = { cellWidth: 'auto' }; }
    if (exportColumns.inOut) { 
      colStyles[colIdx++] = { halign: 'right', cellWidth: 'wrap' }; 
      colStyles[colIdx++] = { halign: 'right', cellWidth: 'wrap' }; 
    }
    if (exportColumns.progressive) { 
      colStyles[colIdx++] = { halign: 'right', cellWidth: 'wrap' }; 
    }

    autoTable(doc, {
      startY: currentY,
      head: [headRow],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [230, 126, 34], halign: 'center' },
      columnStyles: colStyles
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
       doc.setPage(i);
       doc.setFontSize(8);
       doc.text(`Pagina ${i} di ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 10, { align: 'right' });
    }

    doc.save(`Estratto_Conto_Semplificato_${filterStartDate || 'inizio'}_a_${filterEndDate || 'fine'}.pdf`);
    setIsExporting(false);
  };

  const exportExcelSimplified = async () => {
    setIsExporting(true);
    const { data: simplifiedData, totalIncome: sTotInc, totalExpense: sTotExp, balance: sBal } = await buildSimplifiedCashflows(filteredCashflows, initialBalance);

    const data: any[] = [];

    // Riga iniziale di Ripresa Saldi
    if (filterStartDate) {
      const initRow: any = {};
      if (exportColumns.date) initRow['Data'] = formatDateStr(filterStartDate);
      if (exportColumns.location) initRow['Struttura'] = '-';
      if (exportColumns.category) initRow['Categoria'] = 'RIPRESA SALDI';
      initRow['Operatore'] = '-';
      if (exportColumns.details) initRow['Dettagli'] = `Saldo contabile iniziale precedente al ${formatDateStr(filterStartDate)}`;
      if (exportColumns.inOut) {
        initRow['Entrate'] = '';
        initRow['Uscite'] = '';
      }
      if (exportColumns.progressive) initRow['Progressivo'] = Number(initialBalance.toFixed(2));
      data.push(initRow);
    }

    simplifiedData.forEach(cf => {
      const row: any = {};
      if (exportColumns.date) row['Data'] = format(cf.date, 'dd/MM/yyyy HH:mm');
      if (exportColumns.location) row['Struttura'] = formatDisplayLocationText(cf);
      if (exportColumns.category) row['Categoria'] = cf.category;
      row['Operatore'] = (cf as any).operator || '';
      if (exportColumns.details) {
         let detailText = cf.description || '';
         if (cf.category === 'Vendita Vino') {
           if (cf.items && cf.items.length > 0) {
             const wineStr = `Vino venduto:\n` + cf.items.map((it: any) => `- ${getWineName(it.itemId)} (${it.quantity} pz)`).join('\n');
             detailText = detailText ? `${wineStr}\nNote: ${detailText}` : wineStr;
           } else if (cf.itemId) {
             const wineStr = `Vino venduto: ${getWineName(cf.itemId)} (${cf.itemQuantity || 1} pz)`;
             detailText = detailText ? `${wineStr} - ${detailText}` : wineStr;
           }
         }
         row['Dettagli'] = detailText;
      }
      if (exportColumns.inOut) {
         row['Entrate'] = cf.type === 'income' ? (cf.amount || 0) : '';
         row['Uscite'] = (cf.type === 'expense' || cf.type === 'out') ? -(cf.amount || 0) : '';
      }
      if (exportColumns.progressive) row['Progressivo'] = Number(((cf as any).progressiveBalance || 0).toFixed(2));
      data.push(row);
    });

    const totalsRow: any = {};
    if (exportColumns.date) totalsRow['Data'] = filterStartDate ? 'TOTALE PERIODO' : 'TOTALE';
    if (exportColumns.location) totalsRow['Struttura'] = '';
    if (exportColumns.category) totalsRow['Categoria'] = '';
    totalsRow['Operatore'] = '';
    if (exportColumns.details) totalsRow['Dettagli'] = '';
    if (exportColumns.inOut) {
       totalsRow['Entrate'] = Number(sTotInc.toFixed(2));
       totalsRow['Uscite'] = Number((-sTotExp).toFixed(2));
    }
    if (exportColumns.progressive) totalsRow['Progressivo'] = Number(sBal.toFixed(2));
    
    data.push(totalsRow);

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Estratto Conto Sempl.");
    XLSX.writeFile(workbook, `Estratto_Conto_Semplificato_${filterStartDate || 'inizio'}_a_${filterEndDate || 'fine'}.xlsx`);
    setIsExporting(false);
  };

  const exportPDF = async () => {
    setIsExporting(true);
    let detailsMap: Record<string, any[]> = {};
    if (exportColumns.liquidationDetails) {
      const promises = filteredCashflows
        .filter(cf => isLiq(cf) && cf.id)
        .map(async cf => {
          try {
            const acts = await getWorkActivitiesByLiquidationId(cf.id!);
            detailsMap[cf.id!] = acts;
          } catch(e) {}
        });
      await Promise.all(promises);
    }

    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(18);
    const dateRangeStr = (filterStartDate || filterEndDate) 
      ? `Dal ${formatDateStr(filterStartDate) || 'Inizio'} Al ${formatDateStr(filterEndDate) || 'Oggi'}` 
      : 'Tutto lo storico';
    doc.text(`Estratto Conto - ${dateRangeStr}`, 14, currentY);
    currentY += 8;
    
    doc.setFontSize(11);
    doc.text(`Proprietà: ${filterProperty} | Appartamento: ${filterApartment} | Categoria: ${filterCategory}`, 14, currentY);
    currentY += 6;

    if (filterStartDate) {
      doc.setFontSize(9.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Saldo Iniziale: € ${initialBalance.toFixed(2)}  |  Entrate: € ${totalIncome.toFixed(2)}  |  Uscite: € ${totalExpense.toFixed(2)}  |  Flusso Netto: € ${(totalIncome - totalExpense).toFixed(2)}  |  Saldo Finale: € ${finalBalance.toFixed(2)}`, 14, currentY);
      doc.setTextColor(0, 0, 0);
      currentY += 6;
    }

    const headRow = [];
    if (exportColumns.date) headRow.push('Data');
    if (exportColumns.location) headRow.push('Appt.');
    if (exportColumns.category) headRow.push('Categoria');
    if (exportColumns.details) headRow.push('Dettagli');
    if (exportColumns.inOut) { headRow.push('Entrate'); headRow.push('Uscite'); }
    if (exportColumns.progressive) headRow.push('Prog.');

    const tableBody: any[] = [];

    // Riga iniziale di Ripresa Saldi se c'è una data iniziale filtrata
    if (filterStartDate) {
      const initRow = [];
      if (exportColumns.date) initRow.push(formatDateStr(filterStartDate));
      if (exportColumns.location) initRow.push('-');
      if (exportColumns.category) initRow.push('RIPRESA SALDI');
      if (exportColumns.details) initRow.push(`Saldo contabile iniziale precedente al ${formatDateStr(filterStartDate)}`);
      if (exportColumns.inOut) {
        initRow.push('-');
        initRow.push('-');
      }
      if (exportColumns.progressive) initRow.push(`€ ${initialBalance.toFixed(2)}`);
      tableBody.push(initRow);
    }

    filteredCashflows.forEach(cf => {
      const row = [];
      if (exportColumns.date) row.push(format(cf.date, 'dd/MM/yyyy HH:mm'));
      if (exportColumns.location) row.push(formatDisplayLocationText(cf));
      if (exportColumns.category) row.push(cf.category);
      if (exportColumns.details) {
         let detailText = cf.description || '';
         if (cf.category === 'Vendita Vino') {
           if (cf.items && cf.items.length > 0) {
             const wineStr = `Vino venduto:\n` + cf.items.map(it => `- ${getWineName(it.itemId)} (${it.quantity} pz)`).join('\n');
             detailText = detailText ? `${wineStr}\nNote: ${detailText}` : wineStr;
           } else if (cf.itemId) {
             const wineStr = `Vino venduto: ${getWineName(cf.itemId)} (${cf.itemQuantity || 1} pz)`;
             detailText = detailText ? `${wineStr} - ${detailText}` : wineStr;
           }
         }
         if (exportColumns.liquidationDetails && detailsMap[cf.id!]) {
            const acts = detailsMap[cf.id!];
            if (acts.length > 0) {
               detailText += (detailText ? '\n\n' : '') + acts.map(a => `• ${format(a.date, 'dd/MM/yy')} | ${a.apartment} - ${a.category}${a.hours ? ` (${a.hours}h)` : ''}: € ${(a.amount||0).toFixed(2)}` + (exportColumns.liquidationOperator ? ` (${a.operator})` : '')).join('\n');
            }
         }
         row.push(detailText);
      }
      if (exportColumns.inOut) {
        row.push(cf.type === 'income' ? `€ ${(cf.amount||0).toFixed(2)}` : '');
        row.push((cf.type === 'expense' || cf.type === 'out') ? `-€ ${(cf.amount||0).toFixed(2)}` : '');
      }
      if (exportColumns.progressive) row.push(`€ ${(cf as any).progressiveBalance?.toFixed(2) || '0.00'}`);
      tableBody.push(row);
    });

    const totalsRow = [];
    if (exportColumns.date) totalsRow.push(filterStartDate ? 'TOTALE PERIODO' : 'TOTALE');
    if (exportColumns.location) totalsRow.push('');
    if (exportColumns.category) totalsRow.push('');
    if (exportColumns.details) totalsRow.push('');
    if (exportColumns.inOut) {
      totalsRow.push(`€ ${totalIncome.toFixed(2)}`);
      totalsRow.push(`-€ ${totalExpense.toFixed(2)}`);
    }
    if (exportColumns.progressive) totalsRow.push(`€ ${finalBalance.toFixed(2)}`);

    tableBody.push(totalsRow);

    const colStyles: any = {};
    let colIdx = 0;
    if (exportColumns.date) { colStyles[colIdx++] = { cellWidth: 22 }; }
    if (exportColumns.location) { colStyles[colIdx++] = { cellWidth: 22 }; }
    if (exportColumns.category) { colStyles[colIdx++] = { cellWidth: 26 }; }
    if (exportColumns.details) { colStyles[colIdx++] = { cellWidth: 'auto' }; }
    if (exportColumns.inOut) { 
      colStyles[colIdx++] = { halign: 'right', cellWidth: 'wrap' }; 
      colStyles[colIdx++] = { halign: 'right', cellWidth: 'wrap' }; 
    }
    if (exportColumns.progressive) { 
      colStyles[colIdx++] = { halign: 'right', cellWidth: 'wrap' }; 
    }

    autoTable(doc, {
      startY: currentY,
      head: [headRow],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [41, 128, 185], halign: 'center' },
      columnStyles: colStyles
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
       doc.setPage(i);
       doc.setFontSize(8);
       doc.text(`Pagina ${i} di ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 10, { align: 'right' });
    }

    doc.save(`Estratto_Conto_${filterStartDate || 'inizio'}_a_${filterEndDate || 'fine'}.pdf`);
    setIsExporting(false);
  };

  const exportExcel = async () => {
    setIsExporting(true);
    let detailsMap: Record<string, any[]> = {};
    if (exportColumns.liquidationDetails) {
      const promises = filteredCashflows
        .filter(cf => isLiq(cf) && cf.id)
        .map(async cf => {
          try {
            const acts = await getWorkActivitiesByLiquidationId(cf.id!);
            detailsMap[cf.id!] = acts;
          } catch(e) {}
        });
      await Promise.all(promises);
    }

    const data: any[] = [];

    // Riga iniziale di Ripresa Saldi
    if (filterStartDate) {
      const initRow: any = {};
      if (exportColumns.date) initRow['Data'] = formatDateStr(filterStartDate);
      if (exportColumns.location) initRow['Struttura'] = '-';
      if (exportColumns.category) initRow['Categoria'] = 'RIPRESA SALDI';
      if (exportColumns.details) initRow['Dettagli'] = `Saldo contabile iniziale precedente al ${formatDateStr(filterStartDate)}`;
      if (exportColumns.inOut) {
        initRow['Entrate'] = '';
        initRow['Uscite'] = '';
      }
      if (exportColumns.progressive) initRow['Progressivo'] = Number(initialBalance.toFixed(2));
      data.push(initRow);
    }

    filteredCashflows.forEach(cf => {
      const row: any = {};
      if (exportColumns.date) row['Data'] = format(cf.date, 'dd/MM/yyyy HH:mm');
      if (exportColumns.location) row['Struttura'] = formatDisplayLocationText(cf);
      if (exportColumns.category) row['Categoria'] = cf.category;
      if (exportColumns.details) {
         let detailText = cf.description || '';
         if (cf.category === 'Vendita Vino') {
           if (cf.items && cf.items.length > 0) {
             const wineStr = `Vino venduto:\n` + cf.items.map(it => `- ${getWineName(it.itemId)} (${it.quantity} pz)`).join('\n');
             detailText = detailText ? `${wineStr}\nNote: ${detailText}` : wineStr;
           } else if (cf.itemId) {
             const wineStr = `Vino venduto: ${getWineName(cf.itemId)} (${cf.itemQuantity || 1} pz)`;
             detailText = detailText ? `${wineStr} - ${detailText}` : wineStr;
           }
         }
         if (exportColumns.liquidationDetails && detailsMap[cf.id!]) {
            const acts = detailsMap[cf.id!];
            if (acts.length > 0) {
               detailText += (detailText ? '\n\n' : '') + acts.map(a => `• ${format(a.date, 'dd/MM/yy')} | ${a.apartment} - ${a.category}${a.hours ? ` (${a.hours}h)` : ''}: € ${(a.amount||0).toFixed(2)}` + (exportColumns.liquidationOperator ? ` (${a.operator})` : '')).join('\n');
            }
         }
         row['Dettagli'] = detailText;
      }
      if (exportColumns.inOut) {
         row['Entrate'] = cf.type === 'income' ? (cf.amount || 0) : '';
         row['Uscite'] = (cf.type === 'expense' || cf.type === 'out') ? -(cf.amount || 0) : '';
      }
      if (exportColumns.progressive) row['Progressivo'] = Number(((cf as any).progressiveBalance || 0).toFixed(2));
      data.push(row);
    });

    const totalsRow: any = {};
    if (exportColumns.date) totalsRow['Data'] = filterStartDate ? 'TOTALE PERIODO' : 'TOTALE';
    if (exportColumns.location) totalsRow['Struttura'] = '';
    if (exportColumns.category) totalsRow['Categoria'] = '';
    if (exportColumns.details) totalsRow['Dettagli'] = '';
    if (exportColumns.inOut) {
       totalsRow['Entrate'] = Number(totalIncome.toFixed(2));
       totalsRow['Uscite'] = Number((-totalExpense).toFixed(2));
    }
    if (exportColumns.progressive) totalsRow['Progressivo'] = Number(finalBalance.toFixed(2));
    
    data.push(totalsRow);

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Estratto Conto");
    XLSX.writeFile(workbook, `Estratto_Conto_${filterStartDate || 'inizio'}_a_${filterEndDate || 'fine'}.xlsx`);
    setIsExporting(false);
  };


  if (isLoading || settingsLoading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-gray-900 flex items-center gap-2">
            <Wallet className="text-blue-600" />
            Finanze & Cassa
          </h2>
          <p className="text-sm text-gray-500 font-medium">Gestione incassi, spesometto ed estratti conto</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full xl:w-auto">
          {canEdit && (
            <button
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className={`flex flex-col items-center justify-center p-2 sm:p-4 bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 transition shadow-sm ${!isAdmin ? 'col-span-3' : ''}`}
            >
              <Plus size={20} className="mb-1 sm:mb-2 text-blue-600 sm:w-[22px] sm:h-[22px]" />
              <span className="text-[9px] sm:text-xs font-bold uppercase tracking-wider text-center">Nuova Transaz.</span>
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="flex flex-col items-center justify-center p-2 sm:p-4 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-100 transition"
              >
                <SettingsIcon size={20} className="mb-1 sm:mb-2 text-gray-500 sm:w-[22px] sm:h-[22px]" />
                <span className="text-[9px] sm:text-xs font-bold uppercase tracking-wider text-center">Impostazioni</span>
              </button>
              <button
                onClick={() => setIsLogsModalOpen(true)}
                className="flex flex-col items-center justify-center p-2 sm:p-4 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-100 transition"
              >
                <FileText size={20} className="mb-1 sm:mb-2 text-gray-500 sm:w-[22px] sm:h-[22px]" />
                <span className="text-[9px] sm:text-xs font-bold uppercase tracking-wider text-center">Log Modifiche</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

      {/* Summary Cards */}
      <div className={`grid ${filterStartDate ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'} gap-3 sm:gap-4`}>
         {filterStartDate && (
           <div className="bg-white p-3 sm:p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 sm:mb-3">
                <Wallet size={22} className="sm:w-[24px] sm:h-[24px]" />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">
                  Saldo Iniziale
                </p>
                <p className="text-sm sm:text-2xl font-black text-gray-900">
                  €{initialBalance.toFixed(2)}
                </p>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                  Al {formatDateStr(filterStartDate)}
                </p>
              </div>
           </div>
         )}
         <div className="bg-white p-3 sm:p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2 sm:mb-3">
              <TrendingUp size={22} className="sm:w-[24px] sm:h-[24px]" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                {filterStartDate ? 'Entrate Periodo' : 'Entrate'}
              </p>
              <p className="text-sm sm:text-2xl font-black text-gray-900">€{totalIncome.toFixed(2)}</p>
            </div>
         </div>
         <div className="bg-white p-3 sm:p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-2 sm:mb-3">
              <TrendingDown size={22} className="sm:w-[24px] sm:h-[24px]" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                {filterStartDate ? 'Uscite Periodo' : 'Uscite'}
              </p>
              <p className="text-sm sm:text-2xl font-black text-gray-900">€{totalExpense.toFixed(2)}</p>
            </div>
         </div>
         <div className={`p-3 sm:p-5 rounded-2xl border shadow-sm flex flex-col items-center justify-center text-center ${finalBalance >= 0 ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-800' : 'bg-red-50 text-red-900 border-red-200'}`}>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-3 ${finalBalance >= 0 ? 'bg-white/20' : 'bg-red-200 text-red-700'}`}>
               <Wallet size={22} className="sm:w-[24px] sm:h-[24px]" />
            </div>
            <div>
              <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 ${finalBalance >= 0 ? 'text-blue-100' : 'text-red-700'}`}>
                {filterStartDate ? 'Saldo Finale' : 'Bilancio Cassa'}
              </p>
              <p className="text-sm sm:text-2xl font-black">€{finalBalance.toFixed(2)}</p>
              {filterStartDate && (
                <p className={`text-[9px] font-semibold mt-0.5 ${finalBalance >= 0 ? 'text-blue-200' : 'text-red-600'}`}>
                  Flusso netto: {periodNet >= 0 ? '+' : ''}€{periodNet.toFixed(2)}
                </p>
              )}
            </div>
         </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
             <Filter size={16} /> Filtri e Report
          </div>
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1">Periodo rapido:</span>
            <button
              type="button"
              onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition ${!filterStartDate && !filterEndDate ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Tutto
            </button>
            <button
              type="button"
              onClick={() => {
                const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
                const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
                setFilterStartDate(start);
                setFilterEndDate(end);
              }}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              Questo Mese
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                setFilterStartDate(format(d, 'yyyy-MM-dd'));
                setFilterEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              Ultimi 30 gg
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 60);
                setFilterStartDate(format(d, 'yyyy-MM-dd'));
                setFilterEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              Ultimi 60 gg
            </button>
            <button
              type="button"
              onClick={() => {
                const y = new Date().getFullYear();
                setFilterStartDate(`${y}-01-01`);
                setFilterEndDate(`${y}-12-31`);
              }}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              Anno Corrente
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
             <label className="block text-xs font-medium text-gray-500 mb-1">Dal</label>
             <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50"/>
          </div>
          <div>
             <label className="block text-xs font-medium text-gray-500 mb-1">Al</label>
             <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Proprietà</label>
            <select value={filterProperty} onChange={e => handleFilterPropertyChange(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutte">Tutte</option>
               {PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Appartamento</label>
            <select value={filterApartment} onChange={e => handleFilterApartmentChange(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutti">Tutti</option>
               {(filterProperty === 'Tutte' ? APARTMENTS : PROPERTY_APARTMENTS[filterProperty]).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutti">Tutti</option>
               <option value="income">Solo Entrate</option>
               <option value="expense">Solo Uscite</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full text-sm border-gray-300 rounded-lg shadow-sm p-2 bg-gray-50">
               <option value="Tutti">Tutte</option>
               <optgroup label="Entrate">
                 {settings.incomeCategories.map(c => <option key={c} value={c}>{c}</option>)}
               </optgroup>
               <optgroup label="Uscite">
                 {settings.expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
               </optgroup>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-100 mt-2 justify-end">
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setExportMenuOpen(!exportMenuOpen)} className="flex items-center justify-center px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition shadow-sm">
              <Settings2 size={16} className="text-gray-500" /><span className="hidden sm:inline font-semibold text-gray-700 ml-1">Opzioni Export</span>
            </button>
            {exportMenuOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 bottom-12 mb-1 w-64 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden origin-bottom-left sm:origin-bottom-right">
                <div className="p-3 border-b border-gray-50 bg-gray-50/50">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">Dati da Esportare</span>
                </div>
                <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.date} onChange={() => toggleColumn('date')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Data</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.location} onChange={() => toggleColumn('location')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Struttura / Appartamento</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.category} onChange={() => toggleColumn('category')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Categoria</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.details} onChange={() => toggleColumn('details')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Dettagli</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.inOut} onChange={() => toggleColumn('inOut')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Entrate e Uscite</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.progressive} onChange={() => toggleColumn('progressive')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Prog. Bilancio</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                    <input type="checkbox" checked={exportColumns.liquidationDetails} onChange={() => toggleColumn('liquidationDetails')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <span className="text-xs text-gray-700 font-medium">Dettagli Liquidazione Gruppo</span>
                  </label>
                  {exportColumns.liquidationDetails && (
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition ml-4">
                      <input type="checkbox" checked={exportColumns.liquidationOperator} onChange={() => toggleColumn('liquidationOperator')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                      <span className="text-xs text-gray-700 font-medium">Includi Nome Operatore</span>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-end gap-2">
              <button onClick={exportPDF} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                 {isExporting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700"></div> : <FilePdf size={16}/>} Export PDF (Aggregato)
              </button>
              <button onClick={exportPDFSimplified} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                 {isExporting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-700"></div> : <FilePdf size={16}/>} Export PDF (Semplificato)
              </button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={exportExcel} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                 {isExporting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-700"></div> : <FileSpreadsheet size={16}/>} Export Excel (Aggregato)
              </button>
              <button onClick={exportExcelSimplified} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                 {isExporting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-700"></div> : <FileSpreadsheet size={16}/>} Export Excel (Semplificato)
              </button>
            </div>
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
                   <th className="px-3 py-2 w-24 whitespace-nowrap">Prop. / Appt.</th>
                   <th className="px-3 py-2 w-28">Categoria</th>
                   <th className="px-3 py-2">Dettagli</th>
                   <th className="px-3 py-2 w-20 text-right">Entrate</th>
                   <th className="px-3 py-2 w-20 text-right">Uscite</th>
                   <th className="px-3 py-2 w-24 text-right">Prog.</th>
                   <th className="px-3 py-2 w-16 text-center">Ric.</th>
                   <th className="px-3 py-2 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayCashflows.length === 0 ? (
                  <tr><td colSpan={9} className="p-4 text-center text-gray-400 text-sm">Nessuna transazione trovata</td></tr>
                ) : displayCashflows.map((cf) => (
                     <tr key={cf.id} className="hover:bg-gray-50/50">
                       <td className="px-3 py-1.5 text-[11px] text-gray-500 align-middle whitespace-nowrap">{format(cf.date, 'dd/MM/yy HH:mm')}</td>
                       <td className="px-3 py-1.5 text-xs font-medium text-gray-900 align-middle">{formatDisplayLocationHTML(cf)}</td>
                       <td className="px-3 py-1.5 text-[11px] font-semibold align-middle truncate">
                         <span className={`inline-block px-1.5 py-0.5 rounded ${cf.type === 'income' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                           {cf.category}
                         </span>
                       </td>
                       <td className="px-3 py-1.5 text-[11px] text-gray-600 align-middle break-words leading-tight">
                         {cf.category === 'Vendita Vino' ? (
                           cf.items && cf.items.length > 0 ? (
                             <div className="space-y-1">
                               {cf.items.map((it, idx) => (
                                 <div key={idx} className="flex flex-col">
                                   <div><span className="font-bold text-gray-800">{getWineName(it.itemId)}</span> <span className="text-[9px] text-gray-500">({it.quantity} pz)</span></div>
                                 </div>
                               ))}
                               {cf.description && <div className="mt-1 border-t border-gray-100 pt-1 text-gray-500">{cf.description}</div>}
                             </div>
                           ) : cf.itemId ? (
                             <>
                               <span className="font-bold text-gray-800">{getWineName(cf.itemId)}</span>
                               {cf.description ? ` - ${cf.description}` : ''}
                               <div className="text-[9px] text-gray-400 mt-0.5">Sottratti: {cf.itemQuantity} pz magazzino</div>
                             </>
                           ) : (cf.description || '-')
                         ) : (cf.description || '-')}
                         {cf.type === 'work' && cf.workStatus === 'liquidated' && <div className="text-[9px] text-green-600 font-bold mt-0.5">Liquidato</div>}
                       </td>
                       <td className="px-3 py-1.5 text-[11px] font-bold text-blue-600 align-middle text-right whitespace-nowrap">
                          {cf.type === 'income' ? `+€${(cf.amount || 0).toFixed(2)}` : ''}
                       </td>
                       <td className="px-3 py-1.5 text-[11px] font-bold text-amber-600 align-middle text-right whitespace-nowrap">
                          {(cf.type === 'expense' || cf.type === 'out') ? `-€${(cf.amount || 0).toFixed(2)}` : ''}
                       </td>
                       <td className="px-3 py-1.5 text-xs font-bold text-gray-900 align-middle text-right whitespace-nowrap bg-gray-50/30">
                          €{cf.progressiveBalance?.toFixed(2) || '0.00'}
                       </td>
                       <td className="px-3 py-1.5 align-middle text-center">
                          {cf.receiptUrl ? (
                             <button onClick={() => setViewImageUrl(cf.receiptUrl)} className="inline-flex p-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition" title="Vedi Foto">
                                <ImageIcon size={14} />
                             </button>
                          ) : '-'}
                       </td>
                       <td className="px-3 py-1.5 align-middle text-center">
                          {canEdit && (
                            <div className="flex items-center justify-center gap-1">
                               {isLiq(cf) && (
                                 <button onClick={() => handleViewLiquidationDetails(cf.id)} className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition" title="Dettagli Liquidazione">
                                    <FileText size={14} />
                                 </button>
                               )}
                               <button onClick={() => handleEditCashflow(cf)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Modifica">
                                  <SettingsIcon size={14} />
                               </button>
                               <button onClick={() => handleDelete(cf.id, isLiq(cf))} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Elimina">
                                  <Trash2 size={14} />
                               </button>
                            </div>
                          )}
                       </td>
                     </tr>
                ))}
                {/* Riga iniziale di Ripresa Saldi in fondo alla lista cronologica decrescente */}
                {filterStartDate && (
                  <tr className="bg-blue-50/40 border-t border-b border-blue-100 font-medium">
                    <td className="px-3 py-2 text-[11px] text-blue-900 font-bold whitespace-nowrap">
                      {formatDateStr(filterStartDate)}
                    </td>
                    <td className="px-3 py-2 text-xs text-blue-800 font-bold">
                      -
                    </td>
                    <td className="px-3 py-2 text-[11px] font-bold">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold tracking-wide">
                        RIPRESA SALDI
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-blue-900 font-medium italic">
                      Saldo contabile iniziale precedente al {formatDateStr(filterStartDate)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-400 text-right font-medium">-</td>
                    <td className="px-3 py-2 text-[11px] text-gray-400 text-right font-medium">-</td>
                    <td className="px-3 py-2 text-xs font-black text-blue-900 text-right whitespace-nowrap bg-blue-100/50">
                      €{initialBalance.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-400">-</td>
                    <td className="px-3 py-2 text-center"></td>
                  </tr>
                )}
              </tbody>
              {displayCashflows.length > 0 && (
                <tfoot className="bg-gray-50/90 border-t-2 border-gray-200 font-bold text-xs text-gray-900">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-right font-black uppercase text-[10px] tracking-wider text-gray-500">
                      {filterStartDate ? `Totale Periodo (con Saldo Iniziale €${initialBalance.toFixed(2)}):` : 'Totale Complessivo:'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-700 font-black whitespace-nowrap text-[11px]">
                      +€{totalIncome.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-amber-700 font-black whitespace-nowrap text-[11px]">
                      -€{totalExpense.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black whitespace-nowrap bg-gray-100/80 text-gray-900 text-xs">
                      €{finalBalance.toFixed(2)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
         </div>
      </div>

      {/* List - Mobile */}
      <div className="md:hidden space-y-2">
         {displayCashflows.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm shadow-sm">
                Nessuna transazione trovata
            </div>
         ) : displayCashflows.map((cf) => (
            <div key={cf.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col gap-1.5">
               <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                     <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-medium">{format(cf.date, 'dd/MM/yy HH:mm')}</span>
                        <span className="text-xs font-bold text-gray-900">{formatDisplayLocationHTML(cf)}</span>
                     </div>
                     <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 w-max rounded-md ${cf.type === 'income' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                        {cf.category}
                     </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                     <div className={`text-sm font-black ${cf.type === 'income' ? 'text-blue-600' : 'text-amber-600'}`}>
                        {cf.type === 'income' ? '+' : '-'}€{(cf.amount || 0).toFixed(2)}
                     </div>
                     <div className="text-[10px] font-bold text-gray-900 bg-gray-50 px-1.5 rounded">
                        Prog: €{cf.progressiveBalance?.toFixed(2) || '0.00'}
                     </div>
                  </div>
               </div>
               
               {(cf.description || cf.itemId || (cf.items && cf.items.length > 0)) && (
                  <div className="text-[11px] text-gray-600 mt-1 pl-1 border-l-2 border-gray-200">
                     {cf.category === 'Vendita Vino' ? (
                       cf.items && cf.items.length > 0 ? (
                         <div className="space-y-0.5">
                           {cf.items.map((it, idx) => (
                             <div key={idx}><span className="font-bold text-gray-800">{getWineName(it.itemId)}</span> <span className="text-[9px] text-gray-500">({it.quantity} pz)</span></div>
                           ))}
                           {cf.description && <div className="mt-1 border-t border-gray-100 pt-0.5">{cf.description}</div>}
                         </div>
                       ) : cf.itemId ? (
                         <>
                           <span className="font-bold text-gray-800">{getWineName(cf.itemId)}{cf.description ? ' - ' : ''}</span>
                           {cf.description}
                           <div className="text-[9px] text-gray-400 font-medium">Sottratti: {cf.itemQuantity} pz magazzino</div>
                         </>
                       ) : (cf.description)
                     ) : (cf.description)}
                  </div>
               )}
               <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
                  <div className="flex-1"></div>
                  <div className="flex items-center gap-1">
                     {cf.receiptUrl && (
                        <button onClick={() => setViewImageUrl(cf.receiptUrl)} className="inline-flex p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200" title="Vedi Foto">
                           <ImageIcon size={14} />
                        </button>
                     )}
                     {canEdit && (
                        <>
                           {isLiq(cf) && (
                             <button onClick={() => handleViewLiquidationDetails(cf.id)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition" title="Dettagli Liquidazione">
                                <FileText size={14} />
                             </button>
                           )}
                           <button onClick={() => handleEditCashflow(cf)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Modifica">
                              <SettingsIcon size={14} />
                           </button>
                           <button onClick={() => handleDelete(cf.id, isLiq(cf))} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Elimina">
                              <Trash2 size={14} />
                           </button>
                        </>
                     )}
                  </div>
               </div>
            </div>
         ))}
         {/* Mobile Ripresa Saldi Card */}
         {filterStartDate && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 shadow-sm flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-medium">{formatDateStr(filterStartDate)}</span>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                    RIPRESA SALDI
                  </span>
                </div>
                <div className="text-[11px] font-black text-blue-900 bg-blue-100/60 px-2 py-0.5 rounded">
                  Prog: €{initialBalance.toFixed(2)}
                </div>
              </div>
              <div className="text-[11px] text-blue-800 italic mt-0.5">
                Saldo contabile iniziale precedente al {formatDateStr(filterStartDate)}
              </div>
            </div>
         )}
      </div>


      {isLogsModalOpen && <CashflowLogsModal onClose={() => setIsLogsModalOpen(false)} />}

      {isSettingsModalOpen && (
        <SettingsModal 
          initialSettings={settings} 
          onClose={() => setIsSettingsModalOpen(false)} 
          onSave={async (newSettings) => {
             await updateAppSettings(newSettings);
             
             alert("Impostazioni salvate con successo.");
          }}
        />
      )}

      {/* Liquidation Details Modal */}
      {liquidationDetailsId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                 <FileText className="text-purple-600"/> Dettagli Liquidazione
              </h2>
              <button onClick={() => setLiquidationDetailsId(null)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
               {isLiquidationLoading ? (
                  <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>
               ) : liquidationActivities.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Nessun dettaglio trovato o vecchie liquidazioni senza registro dettagliato.</p>
               ) : (
                  <div className="space-y-3">
                     {liquidationActivities.map(act => (
                        <div key={act.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3 flex justify-between items-center">
                           <div>
                              <div className="text-xs text-gray-500">{format(act.date, 'dd/MM/yyyy')} - {act.operator}</div>
                              <div className="font-semibold text-gray-900">{act.apartment} - {act.category}{act.hours ? ` (${act.hours}h)` : ''}</div>
                              {act.description && <div className="text-xs text-gray-600 mt-1">{act.description}</div>}
                           </div>
                           <div className="font-bold text-gray-900 ml-4 max-w-[80px] text-right shrink-0">€{act.amount?.toFixed(2)}</div>
                        </div>
                     ))}
                     <div className="text-right font-bold text-gray-900 text-lg pt-4 border-t border-gray-200 mt-4">
                        Totale: €{liquidationActivities.reduce((acc, a) => acc + (a.amount || 0), 0).toFixed(2)}
                     </div>
                  </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                 <Wallet className="text-blue-600"/> {editingCashflow ? 'Modifica Transazione' : 'Aggiungi Transazione'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
              
              {/* Entrata / Uscita / Attività Switch */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                 <button 
                   type="button" 
                   disabled={editingCashflow?.category === 'Vendita Vino'} 
                   onClick={() => setType('income')} 
                   className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border transition ${type === 'income' ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                 >
                   <TrendingUp size={20} className="mb-1" />
                   <span className="font-bold text-[10px] sm:text-xs">Entrata</span>
                 </button>
                 <button 
                   type="button" 
                   disabled={editingCashflow?.category === 'Vendita Vino'} 
                   onClick={() => setType('expense')} 
                   className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border transition ${type === 'expense' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                 >
                   <TrendingDown size={20} className="mb-1" />
                   <span className="font-bold text-[10px] sm:text-xs">Uscita</span>
                 </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Data Transazione</label>
                   <input 
                     type="date" 
                     required 
                     value={transactionDate} 
                     onChange={e => setTransactionDate(e.target.value)} 
                     className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" 
                   />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 truncate">Proprietà</label>
                    <select value={property} onChange={e => {
                       setProperty(e.target.value);
                    }} disabled={editingCashflow?.category === 'Vendita Vino'} className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50">
                       <option value="">(Nessuna / Tratta da appartamento)</option>
                       {PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 truncate">Appartamento</label>
                    <select value={apartment} onChange={e => {
                       setApartment(e.target.value);
                       // Se l'utente seleziona l'appartamento, proviamo a pre-impostare la proprietà associata se 'property' è vuoto
                       if (e.target.value && !property) {
                         // Non impostiamo esplicitamente 'property' qui per permettere il fallback automatico 
                         // o l'override manuale.
                       }
                    }} disabled={editingCashflow?.category === 'Vendita Vino'} className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50">
                       <option value="">(Nessuno)</option>
                       {APARTMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                   <select value={category} onChange={e => setCategory(e.target.value)} disabled={editingCashflow?.category === 'Vendita Vino'} className="w-full p-2 border border-gray-300 rounded-lg disabled:opacity-50">
                      {(type === 'income' ? settings.incomeCategories : settings.expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                   {category === 'Altro' && (
                     <input 
                       type="text" 
                       required 
                       placeholder="Specifica nuova causale..." 
                       value={customCategory} 
                       onChange={e => setCustomCategory(e.target.value)} 
                       className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-blue-50"
                     />
                   )}
                </div>
              </div>

              {/* Special logical fields */}
              {category === 'Parking' && (
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Giorni di Parcheggio</label>
                   <select required value={parkingDays} onChange={e => setParkingDays(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                      {Array.from({ length: 30 }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                   </select>
                   <div className="text-[10px] text-gray-400 mt-1">Calcolo automatico: {apartment === 'Sunrise' ? '10' : '15'}€ x {parkingDays}gg = {apartment === 'Sunrise' ? 10 * parkingDays : 15 * parkingDays}€</div>
                </div>
              )}

              {category === 'Vendita Vino' && apartment !== 'Sunrise' && (
                <div className="space-y-3 bg-blue-50/50 p-4 border border-blue-100 rounded-xl">
                   {editingCashflow ? (
                     <div className="space-y-3">
                       <div className="text-sm text-blue-800 font-medium pb-2 border-b border-blue-200">
                         Vino e quantità non modificabili. Per cambiarli, elimina e ricrea questa transazione (verranno automaticamente ripristinate le quantità in magazzino).
                       </div>
                       {editingCashflow.items && editingCashflow.items.map((it, idx) => (
                         <div key={idx} className="flex items-center justify-between bg-white p-2 border border-blue-200 rounded-lg shadow-sm">
                           <div className="flex flex-col">
                             <span className="text-sm font-semibold text-gray-800">{getWineName(it.itemId)}</span>
                             <span className="text-xs text-gray-500">{it.quantity} pz</span>
                           </div>
                         </div>
                       ))}
                       {!editingCashflow.items && editingCashflow.itemId && (
                         <div className="flex items-center justify-between bg-white p-2 border border-blue-200 rounded-lg shadow-sm">
                           <div className="flex flex-col">
                             <span className="text-sm font-semibold text-gray-800">{getWineName(editingCashflow.itemId)}</span>
                             <span className="text-xs text-gray-500">{editingCashflow.itemQuantity || 1} pz</span>
                           </div>
                         </div>
                       )}
                     </div>
                   ) : (
                     <div className="space-y-3">
                       {selectedWines.map((sw, idx) => (
                           <div key={idx} className="flex items-center justify-between bg-white p-2 border border-blue-200 rounded-lg shadow-sm">
                             <div className="flex flex-col">
                               <span className="text-sm font-semibold text-gray-800">{getWineName(sw.wineId)}</span>
                               <span className="text-xs text-gray-500">{sw.quantity} pz x 10€ = {sw.quantity * 10}€</span>
                             </div>
                             <button type="button" onClick={() => {
                               const newWines = [...selectedWines];
                               newWines.splice(idx, 1);
                               setSelectedWines(newWines);
                               setAmountStr((newWines.reduce((sum, w) => sum + (w.quantity * 10), 0)).toString());
                             }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><X size={16}/></button>
                           </div>
                       ))}
                       <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end p-3 bg-white/50 rounded-lg border border-blue-100">
                         <div className="flex-1 w-full sm:w-auto">
                           <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Aggiungi Vino (Dal Magazzino)</label>
                           <select value={currentWineId} onChange={e => {
                               setCurrentWineId(e.target.value);
                               setCurrentWineQuantity(1);
                           }} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                              <option value="">-- Seleziona Vino --</option>
                              {items.filter(i => i.quantity > 0 && (i.category?.toLowerCase() || '').includes('vin')).map(i => <option key={i.id} value={i.id}>{i.name} ({i.quantity} disp.)</option>)}
                           </select>
                         </div>
                         <div className="w-full sm:w-24">
                           <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Q.tà</label>
                           <select value={currentWineQuantity} onChange={e => setCurrentWineQuantity(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                               {Array.from({ length: Math.max(1, Math.min(100, items.find(i => i.id === currentWineId)?.quantity || 30)) }, (_, i) => i + 1).map(num => (
                                 <option key={num} value={num}>{num}</option>
                               ))}
                           </select>
                         </div>
                         <button type="button" disabled={!currentWineId} onClick={() => {
                            if(!currentWineId) return;
                            const existingIdx = selectedWines.findIndex(w => w.wineId === currentWineId);
                            let newWines = [...selectedWines];
                            if (existingIdx >= 0) {
                              newWines[existingIdx].quantity += currentWineQuantity;
                            } else {
                              newWines.push({ wineId: currentWineId, quantity: currentWineQuantity });
                            }
                            setSelectedWines(newWines);
                            setCurrentWineId('');
                            setCurrentWineQuantity(1);
                            setAmountStr((newWines.reduce((sum, w) => sum + (w.quantity * 10), 0)).toString());
                         }} className="w-full sm:w-auto mt-2 sm:mt-0 p-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:opacity-50 transition flex justify-center items-center gap-1">
                           <Plus size={16}/> Aggiungi
                         </button>
                       </div>
                       
                       {selectedWines.length > 0 && (
                         <div className="text-xs text-blue-800 font-medium bg-blue-100 p-2.5 rounded-lg flex items-center justify-between shadow-sm">
                           <span>Vendita: sottrarrà autom. {selectedWines.reduce((acc, w) => acc + w.quantity, 0)} bottiglie dal magazzino.</span>
                           <span className="font-bold text-base">Tot: €{10 * selectedWines.reduce((acc, w) => acc + w.quantity, 0)}</span>
                         </div>
                       )}
                     </div>
                   )}
                </div>
              )}

              {category === 'Vendita Vino' && apartment === 'Sunrise' && (
                 <div className="p-3 bg-red-50 text-red-600 font-medium text-sm rounded-lg">
                   Vendita Vino non abilitata per Sunrise.
                 </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Importo (€)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  required 
                  value={amountStr} 
                  onChange={e => setAmountStr(e.target.value)} 
                  className="w-full p-2.5 text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" 
                  placeholder="Es. 100.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dettagli / Note</label>
                <textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  placeholder="Note aggiuntive su questa operazione"
                  rows={2}
                />
              </div>

              {type === 'expense' && (
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Allega Scontrino / Ricevuta (Opzionale)</label>
                   {receiptUrl ? (
                     <div className="relative inline-block mt-2">
                       <img src={receiptUrl} alt="Scontrino" className="h-32 object-cover rounded-xl border border-gray-200" />
                       <button type="button" onClick={() => setReceiptUrl('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"><X size={14}/></button>
                     </div>
                   ) : (
                     <div className="mt-1 flex items-center gap-3">
                         <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                           <Camera size={16}/> Carica Foto
                           <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                         </label>
                         <span className="text-xs text-gray-400">Verrà compressa automaticamente</span>
                     </div>
                   )}
                 </div>
              )}
              
            </form>
            
            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
               <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition text-sm">Annulla</button>
               {!(category === 'Vendita Vino' && apartment === 'Sunrise') && (
                 <button disabled={isSubmitting} onClick={handleSubmit} className="px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white font-bold rounded-xl shadow-md shadow-blue-200 hover:bg-blue-700 transition flex items-center gap-2 text-sm">
                   {editingCashflow ? <SettingsIcon size={18}/> : <Plus size={18}/>} 
                   {editingCashflow ? 'Salva Modifiche' : 'Salva'}
                 </button>
               )}
            </div>
          </div>
        </div>
      )}

      {viewImageUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setViewImageUrl(null)}>
          <div className="relative max-w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <img src={viewImageUrl} alt="Ricevuta" className="max-w-full max-h-[90vh] object-contain rounded-xl" />
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              <button 
                className="text-white bg-black/50 hover:bg-black/80 p-2 rounded-full transition"
                onClick={() => handleShareImage(viewImageUrl)}
                title="Condividi"
              >
                <Share2 size={24} />
              </button>
              <button 
                className="text-white bg-black/50 hover:bg-black/80 p-2 rounded-full transition"
                onClick={() => setViewImageUrl(null)}
                title="Chiudi"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
