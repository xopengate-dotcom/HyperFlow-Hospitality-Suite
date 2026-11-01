import React, { useState, useEffect, useMemo } from 'react';
import { Item } from '../types';
import { getItems, deleteItem, CATEGORIES, addTransaction, getCatalogItemByBarcode } from '../firebase/api';
import { Plus, Trash2, Edit2, ArrowDownCircle, ArrowUpCircle, AlertCircle, RefreshCw, TriangleAlert, Image as ImageIcon, ScanBarcode, Receipt, ChevronDown } from 'lucide-react';
import { ItemModal } from './ItemModal';
import { InvoiceScannerModal } from './InvoiceScannerModal';
import { auth } from '../firebase/config';
import { useAuthContext } from './Auth';
import { useSettings } from './SettingsProvider';
import { BarcodeScanner } from './BarcodeScanner';

export function Inventory() {
  const { settings } = useSettings();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedProperty, setSelectedProperty] = useState(settings.properties[0]);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | undefined>(undefined);
  const [scannedBarcodeToCreate, setScannedBarcodeToCreate] = useState<string>('');

  const [transactionModal, setTransactionModal] = useState<{ isOpen: boolean, type: 'in'|'out', item?: Item | null }>({ isOpen: false, type: 'in', item: null });
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionApartment, setTransactionApartment] = useState('');
  const [transactionNotes, setTransactionNotes] = useState('');
  const [transactionSaving, setTransactionSaving] = useState(false);

  const [isScanningBarcode, setIsScanningBarcode] = useState(false);

  const { isAdmin, hideFinancials } = useAuthContext();

  const loadData = async () => {
    setLoading(true);
    try {
      const itemsData = await getItems();
      setItems(itemsData);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Errore nel caricamento dei dati.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleDelete = async (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questo elemento?')) {
      await deleteItem(id);
      loadData();
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(transactionAmount);
    if (!transactionModal.item || isNaN(amount) || amount <= 0) return;
    if (transactionModal.type === 'out' && amount > transactionModal.item.quantity && !['Biancheria', 'noleggio', 'Noleggio', 'NOLEGGIO'].includes(transactionModal.item.category)) {
       alert("Non puoi prelevare più di quello che hai in giacenza!");
       return;
    }

    setTransactionSaving(true);
    try {
      await addTransaction(
        transactionModal.item, 
        transactionModal.type, 
        amount, 
        transactionModal.type === 'out' ? transactionApartment : undefined,
        transactionNotes.trim() || undefined
      );
      
      setTransactionModal({ isOpen: false, type: 'in', item: null });
      setTransactionAmount('');
      setTransactionNotes('');
      loadData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setTransactionSaving(false);
    }
  };

  const handleGlobalBarcodeScan = async (barcode: string) => {
    setIsScanningBarcode(false);
    // Cerca l'articolo nel magazzino e proprietà attuale
    const foundItem = items.find(i => {
      if (i.barcode !== barcode) return false;
      if (i.property === selectedProperty) return true;
      const isGeneric = i.property === 'Tutte le Proprietà' || i.property === 'Tutte' || !i.property;
      const propertyOwnsApartments = i.property ? (settings.propertyApartments[i.property] || []).length > 0 : false;
      return isGeneric || !propertyOwnsApartments;
    });
    
    if (foundItem) {
      const defaultApt = settings.apartments.find(a => a.property === selectedProperty)?.name || '';
      setTransactionApartment(defaultApt);
      setTransactionModal({ isOpen: true, type: 'out', item: foundItem });
      // auto set amount to 1 to speed up
      setTransactionAmount('1');
    } else {
      const catalogMatch = await getCatalogItemByBarcode(barcode);
      let msg = `Nessun articolo trovato in magazzino per il barcode: ${barcode}.`;
      if (catalogMatch) {
         msg = `Trovato "${catalogMatch.name}" in Anagrafica.`;
      }
      if (confirm(`${msg}\nVuoi aggiungere un nuovo articolo con questo codice in questo magazzino?`)) {
        setScannedBarcodeToCreate(barcode);
        setEditingItem(undefined);
        setIsItemModalOpen(true);
      }
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  const filteredItems = items.filter(item => (item.property || settings.properties[0]) === selectedProperty);
  const totalValue = filteredItems.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Le mie Scorte</h2>
          {!hideFinancials ? (
            <p className="text-sm font-medium text-gray-500 mt-1">Valore totale stimato: <span className="text-gray-900 font-bold">€{totalValue.toFixed(2)}</span></p>
          ) : (
            <p className="text-sm text-gray-500">Gestisci l'inventario del magazzino</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="px-3 py-2 sm:px-4 sm:py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm font-semibold text-gray-800 max-w-[200px] sm:max-w-xs truncate"
          >
            {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="flex items-center justify-center p-2 sm:px-4 sm:py-2 bg-indigo-50 text-indigo-700 font-medium rounded-xl hover:bg-indigo-100 transition border border-indigo-100"
              title="Importa Fattura"
            >
              <Receipt size={18} />
            </button>
            <button
              onClick={() => setIsScanningBarcode(true)}
              className="flex items-center justify-center p-2 sm:px-4 sm:py-2 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
              title="Usa Barcode o EAN code"
            >
              <ScanBarcode size={18} />
            </button>
            <button
              onClick={() => { setScannedBarcodeToCreate(''); setEditingItem(undefined); setIsItemModalOpen(true); }}
              className="flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition"
            >
              <Plus size={18} />
              <span className="whitespace-nowrap hidden sm:inline">Nuovo Articolo</span>
              <span className="whitespace-nowrap sm:hidden">Nuovo</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-medium text-xs sm:text-sm uppercase tracking-wider">
              <tr>
                <th className="py-3 pl-3 pr-1 sm:p-4 sm:px-6">Articolo</th>
                <th className="p-3 sm:p-4 hidden md:table-cell">Categoria</th>
                <th className="py-3 px-1 sm:p-4 text-center">Giacenza</th>
                <th className="py-3 pr-3 pl-1 sm:p-4 sm:px-6 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.length === 0 ? (
                <tr>
                   <td colSpan={4} className="p-8 text-center text-gray-400">Nessun articolo in magazzino per questa proprietà. Clicca su "Nuovo Articolo" per iniziare.</td>
                </tr>
              ) : filteredItems.map((item) => {
                const isLowStock = item.minQuantity !== undefined && item.quantity <= item.minQuantity;

                return (
                <tr key={item.id} className={`transition ${isLowStock ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-gray-50/50'}`}>
                  <td className="py-3 pl-3 pr-1 sm:p-4 sm:px-6 font-medium text-gray-900">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300">
                          <ImageIcon size={16} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm sm:text-base font-semibold leading-tight">{item.name}</div>
                        {!hideFinancials && item.price !== undefined && (
                          <span className="text-[10px] sm:text-xs font-normal text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded mr-1 inline-block mt-0.5">€{item.price.toFixed(2)}</span>
                        )}
                        <span className="text-[10px] sm:text-xs text-gray-400 md:hidden block mt-0.5 truncate">{item.category}</span>
                        {isLowStock && (
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-red-600">
                            <TriangleAlert size={10} /> Sottoscorta
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 sm:p-4 hidden md:table-cell">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3 px-1 sm:p-4 text-center">
                    <div className={`text-base sm:text-lg font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity}</div>
                    <div className="text-[9px] sm:text-xs text-gray-400 leading-none">{item.unit}</div>
                  </td>
                  <td className="py-3 pr-3 pl-1 sm:p-4 sm:px-6 text-right">
                    <div className="flex items-center justify-end gap-1 sm:gap-2">
                       <button
                        title="Aggiungi scorta (Carico)"
                        onClick={() => {
                          setTransactionApartment(settings.propertyApartments[selectedProperty][0]);
                          setTransactionModal({ isOpen: true, type: 'in', item });
                        }}
                        className="p-1 sm:p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                      >
                        <ArrowUpCircle className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px]" />
                      </button>
                      <button
                        title="Preleva (Scarico)"
                        onClick={() => {
                          setTransactionApartment(settings.propertyApartments[selectedProperty][0]);
                          setTransactionModal({ isOpen: true, type: 'out', item });
                        }}
                        disabled={item.quantity === 0}
                        className="p-1 sm:p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition disabled:opacity-50"
                      >
                        <ArrowDownCircle className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px]" />
                      </button>
                      
                      {(isAdmin || !hideFinancials) && (
                        <>
                          <div className="w-px h-5 bg-gray-200 mx-0.5 sm:mx-1"></div>
                          <button
                            onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }}
                            className="p-1 sm:p-1.5 text-gray-400 hover:text-blue-600 transition"
                          >
                            <Edit2 className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px]" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1 sm:p-1.5 text-gray-400 hover:text-red-600 transition"
                            >
                              <Trash2 className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px]" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSaved={loadData}
        item={editingItem}
        existingCategories={Array.from(new Set([...CATEGORIES, ...items.map(i => i.category)])).sort()}
        defaultProperty={selectedProperty}
        initialBarcode={scannedBarcodeToCreate}
      />

      <InvoiceScannerModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onImportCompleted={loadData}
        selectedProperty={selectedProperty}
      />

      {transactionModal.isOpen && transactionModal.item && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {transactionModal.type === 'in' ? 'Carico Magazzino' : 'Scarico Magazzino'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Articolo: <strong className="text-gray-900">{transactionModal.item.name}</strong>
              <br />Giacenza attuale: {transactionModal.item.quantity} {transactionModal.item.unit}
            </p>
            
            <form onSubmit={handleTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantità ({transactionModal.item.unit})</label>
                <select
                  required
                  value={transactionAmount}
                  onChange={e => setTransactionAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="" disabled>Seleziona...</option>
                  {transactionModal.type === 'out' 
                    ? Array.from({ length: transactionModal.item.quantity }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))
                    : [...Array.from({ length: 100 }, (_, i) => i + 1), 150, 200, 250, 300, 400, 500, 1000].map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))
                  }
                </select>
              </div>

              {transactionModal.type === 'out' && (
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Destinazione</label>
                   <select 
                     value={transactionApartment}
                     onChange={e => setTransactionApartment(e.target.value)}
                     className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                   >
                     {settings.propertyApartments[selectedProperty].map((ap: string) => <option key={ap} value={ap}>{ap}</option>)}
                   </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note / Motivo (Opzionale)</label>
                <input
                  type="text"
                  maxLength={100}
                  value={transactionNotes}
                  onChange={e => setTransactionNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-300"
                  placeholder={transactionModal.type === 'out' ? "Es. Sostituzione pezzo rotto" : "Es. Nuovo fornitore"}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setTransactionModal({ isOpen: false, type: 'in', item: null })}
                  className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={transactionSaving}
                  className={`flex-1 px-4 py-2 text-white rounded-xl transition ${
                    transactionModal.type === 'in' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
                  } flex items-center justify-center`}
                >
                  {transactionSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Conferma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isScanningBarcode && (
        <BarcodeScanner
          onScan={handleGlobalBarcodeScan}
          onClose={() => setIsScanningBarcode(false)}
        />
      )}
    </div>
  );
}
