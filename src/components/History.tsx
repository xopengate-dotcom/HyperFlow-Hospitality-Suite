import { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { getTransactions, updateTransaction, deleteTransaction } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { ArrowDownRight, ArrowUpRight, AlertCircle, RefreshCw, User, MapPin, FileText, Edit2, Loader2, Check, X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useAuthContext } from './Auth';

export function History() {
  const { settings, loading: settingsLoading } = useSettings();
  const { isAdmin } = useAuthContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProperty, setSelectedProperty] = useState('Tutte');
  const [showEdits, setShowEdits] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (settings.properties.length > 0 && !selectedProperty) {
      setSelectedProperty(settings.properties[0]);
    }
  }, [settings.properties, selectedProperty]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await getTransactions();
      setTransactions(data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Errore nel caricamento delle transazioni.');
    } finally {
      setLoading(false);
    }
  };

  const startEditingNote = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditingNotes(tx.notes || '');
  };

  const saveNote = async (id: string) => {
    if (isSavingNote) return;
    setIsSavingNote(true);
    try {
      await updateTransaction(id, { notes: editingNotes });
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, notes: editingNotes } : t));
      setEditingTxId(null);
    } catch (e: any) {
      setError(e.message || 'Errore durante il salvataggio della nota.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Sei sicuro di voler eliminare definitivamente questo movimento? ATTENZIONE: Questo eliminerà solo il record del movimento, non ripristinerà automaticamente la giacenza nell'inventario. Ricordati di correggere la quantità manualmente se necessario.")) return;
    setLoading(true);
    try {
      await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Errore durante l\'eliminazione del movimento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  if (loading || settingsLoading) {
    return <div className="flex justify-center p-12"><RefreshCw className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  const filteredTransactions = transactions.filter(t => {
    if (!showEdits && t.type === 'edit') return false;
    if (selectedProperty === 'Tutte') return true;
    return (t.property || 'Tutte le Proprietà') === selectedProperty;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-gray-900">Registro Movimenti</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Traccia ogni carico e scarico effettuato nel magazzino</p>
        </div>
        <div className="flex flex-row items-center justify-end gap-2 w-full sm:w-auto">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 transition shadow-sm">
            <input
              type="checkbox"
              checked={showEdits}
              onChange={(e) => setShowEdits(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 bg-gray-100 border-gray-300 h-3.5 w-3.5"
            />
            Mostra INFO
          </label>
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-[11px] font-medium shadow-sm max-w-[130px] sm:max-w-none"
          >
            <option value="Tutte">Tutte le prop.</option>
            {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-[10px] sm:text-[11px] uppercase text-gray-500 font-semibold tracking-wider">
              <tr>
                <th className="px-2 py-1 w-8 text-center" title="Tipo">T</th>
                <th className="px-2 py-1 w-auto whitespace-nowrap">Data</th>
                <th className="px-2 py-1 w-full min-w-[80px]">Articolo</th>
                <th className="px-2 py-1 w-auto" title="Operatore">Op.</th>
                <th className="px-2 py-1 w-auto" title="Destinazione">Dest.</th>
                <th className="px-2 py-1 w-auto text-right">Q.tà</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-[11px] sm:text-xs">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400">Nessun movimento registrato finora per questa proprietà.</td>
                </tr>
              ) : filteredTransactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-2 py-1 text-center align-middle">
                    <div className={`inline-flex items-center justify-center p-1 rounded-md ${
                      t.type === 'in' ? 'bg-blue-50 text-blue-600' : 
                      t.type === 'out' ? 'bg-amber-50 text-amber-600' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      {t.type === 'in' ? <ArrowUpRight size={12} /> : 
                       t.type === 'out' ? <ArrowDownRight size={12} /> :
                       <RefreshCw size={12} />}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-gray-500 align-middle whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-700">{format(t.date, "dd/MM/yy")}</span>
                      <span className="text-[9px] sm:text-[10px]">{format(t.date, "HH:mm")}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1 font-bold text-gray-900 align-middle leading-tight break-words min-w-[80px]">
                    {t.itemName}
                  </td>
                  <td className="px-2 py-1 text-gray-600 font-medium align-middle whitespace-nowrap overflow-hidden text-ellipsis max-w-[60px] sm:max-w-none">
                    {t.operator ? t.operator.split(' ')[0] : '-'}
                  </td>
                  <td className="px-2 py-1 align-middle break-words group cursor-pointer" onDoubleClick={() => startEditingNote(t)}>
                    {editingTxId === t.id ? (
                      <div className="flex items-center gap-1">
                        <textarea
                          autoFocus
                          value={editingNotes}
                          onChange={e => setEditingNotes(e.target.value)}
                          className="w-full text-xs p-1 border rounded resize-none"
                          rows={2}
                        />
                        <div className="flex flex-col gap-1">
                          <button disabled={isSavingNote} onClick={() => saveNote(t.id)} className="p-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded transition">
                            {isSavingNote ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button disabled={isSavingNote} onClick={() => setEditingTxId(null)} className="p-1 bg-red-100 text-red-700 hover:bg-red-200 rounded transition">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1 w-full" onClick={() => startEditingNote(t)}>
                         <div className="flex-1">
                        {t.type === 'out' && t.apartment && (
                           <div className="mb-1">
                             <span className="bg-blue-50 text-blue-700 px-1 py-0.5 rounded text-[10px] font-bold border border-blue-100 inline-flex items-center gap-1 w-fit whitespace-nowrap">
                               <MapPin size={10}/> {t.apartment}
                             </span>
                           </div>
                        )}
                        {t.notes ? (
                          <span className="text-gray-500 text-[10px] italic line-clamp-2" title={t.notes}>
                            {t.notes}
                          </span>
                        ) : t.type === 'edit' ? (
                          <span className="text-gray-500 text-[10px] italic line-clamp-2">Aggiornamento anagrafica</span>
                        ) : t.type === 'in' ? (
                          <span className="text-gray-500 text-[10px] italic line-clamp-2">Carico magazzino</span>
                        ) : t.type === 'out' ? (
                          <span className="text-gray-500 text-[10px] italic line-clamp-2">Scarico materiale</span>
                        ) : (
                          <span className="text-gray-300 text-[10px] items-center gap-1 italic flex">Aggiungi nota</span>
                        )}
                         </div>
                         <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 mt-2 sm:mt-0">
                           <Edit2 size={16} className="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer sm:w-3 sm:h-3" />
                           {isAdmin && (
                             <Trash2 
                               size={16} 
                               className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer sm:w-3 sm:h-3" 
                               onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} 
                             />
                           )}
                         </div>
                      </div>
                    )}
                  </td>
                  <td className={`px-2 py-1 text-right font-black align-middle text-sm whitespace-nowrap ${
                      t.type === 'in' ? 'text-blue-600' : 
                      t.type === 'out' ? 'text-amber-600' : 
                      'text-gray-400'
                  }`}>
                    {t.type === 'in' ? '+' : t.type === 'out' ? '-' : ''}{t.type !== 'edit' ? t.quantity : 'INFO'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
