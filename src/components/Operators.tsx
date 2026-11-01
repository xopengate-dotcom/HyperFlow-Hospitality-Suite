import React, { useState, useEffect } from 'react';
import { Operator } from '../types';
import { getOperators, addOperator, deleteOperator, updateOperator, resetOperatorPassword } from '../firebase/api';
import { RefreshCw, AlertCircle, Plus, Trash2, ShieldAlert, Edit2, CheckCircle2, X } from 'lucide-react';
import { format } from 'date-fns';

const DEFAULT_PERMISSIONS = {
  dashboard: true,
  inventory: true,
  orders: true,
  history: true,
  cashflow: true,
  cashflowEdit: false,
  reports: true,
  properties: false,
  parking: true,
  parkingEdit: false,
  works: false
};

const PERMISSIONS_LABELS = {
  dashboard: 'Dashboard',
  inventory: 'Scorte',
  orders: 'Ordini',
  history: 'Movimenti',
  cashflow: 'Finanze (Visivo)',
  cashflowEdit: 'Finanze (Modifica)',
  reports: 'Stock Report',
  properties: 'Proprietà (Admin)',
  parking: 'Posto Auto (Visivo)',
  parkingEdit: 'Posto Auto (Modifica)',
  works: 'Competenze e Servizi'
};

export function Operators() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    hideFinancials: false,
    isAdmin: false,
    role: 'magazzino' as 'magazzino' | 'acquisti' | 'admin',
    permissions: { ...DEFAULT_PERMISSIONS }
  });
  
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadOperators();
  }, []);

  async function loadOperators() {
    setLoading(true);
    try {
      const data = await getOperators();
      setOperators(data);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const openAddForm = () => {
     setFormData({
       name: '',
       email: '',
       password: '',
       hideFinancials: false,
       isAdmin: false,
       role: 'magazzino',
       permissions: { ...DEFAULT_PERMISSIONS }
     });
     setEditingId(null);
     setIsAdding(true);
  };

  const openEditForm = (op: Operator) => {
     setFormData({
       name: op.name,
       email: op.email,
       password: '',
       hideFinancials: op.hideFinancials || false,
       isAdmin: op.isAdmin || false,
       role: op.role || 'magazzino',
       permissions: op.permissions || { ...DEFAULT_PERMISSIONS }
     });
     setEditingId(op.id);
     setIsAdding(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (!editingId && !formData.email.trim()) return;
    if (!editingId && formData.password && formData.password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
         await updateOperator(editingId, {
            name: formData.name.trim(),
            hideFinancials: formData.hideFinancials,
            isAdmin: formData.isAdmin,
            role: formData.role,
            permissions: formData.permissions
         });
      } else {
         await addOperator(
           formData.name.trim(), 
           formData.email.trim(), 
           formData.password || undefined, 
           formData.hideFinancials, 
           formData.isAdmin, 
           formData.role,
           formData.permissions
         );
      }
      setIsAdding(false);
      await loadOperators();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Sei sicuro di voler eliminare l'operatore "${name}"?\nNota: l'utente Firebase Authentication associato non verrà eliminato, perderà solo i permessi.`)) return;
    
    try {
      await deleteOperator(id);
      await loadOperators();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const togglePermission = (key: keyof typeof DEFAULT_PERMISSIONS) => {
    setFormData(prev => ({
       ...prev,
       permissions: {
         ...prev.permissions,
         [key]: !prev.permissions[key]
       }
    }));
  };

  if (loading && operators.length === 0) {
    return <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Operatori App</h2>
          <p className="text-sm text-gray-500">Crea account dedicati o modifica permessi specifici.</p>
        </div>
        {!isAdding && (
           <button
             onClick={openAddForm}
             className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition shadow-sm"
           >
             <Plus size={20} />
             Nuovo Operatore
           </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <p className="whitespace-pre-wrap text-sm">{error}</p>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleSave} className="bg-white p-6 md:p-8 rounded-2xl border border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Modifica Operatore' : 'Nuovo Operatore'}</h3>
             <button type="button" onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600">
               <X size={24} />
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Nome Cognome</label>
                 <input
                   type="text"
                   value={formData.name}
                   onChange={(e) => setFormData({...formData, name: e.target.value})}
                   className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                   required
                 />
               </div>
               {!editingId && (
                 <>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Email di Accesso</label>
                     <input
                       type="email"
                       value={formData.email}
                       onChange={(e) => setFormData({...formData, email: e.target.value})}
                       className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                       required
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Password Iniziale</label>
                     <input
                       type="text"
                       value={formData.password}
                       onChange={(e) => setFormData({...formData, password: e.target.value})}
                       placeholder="Senza spazi, min 6 char"
                       className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                     />
                   </div>
                 </>
               )}
               {editingId && (
                 <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-2">
                   <h4 className="text-sm font-semibold text-gray-800 mb-2">Sicurezza e Accesso</h4>
                   <p className="text-xs text-gray-500 mb-4 whitespace-pre-wrap">Per motivi di sicurezza di Firebase, da questo pannello non è possibile sovrascrivere direttamente la mail/password. Tuttavia puoi inviare un'email all'operatore con un link sicuro per reimpostare la propria password.</p>
                   <button
                     type="button"
                     onClick={async () => {
                       if (!formData.email) {
                          alert("L'operatore non ha un'email registrata.");
                          return;
                       }
                       if (window.confirm("Vuoi inviare un'email di reset password a " + formData.email + "?")) {
                          try {
                             await resetOperatorPassword(formData.email);
                             alert("Email di reset inviata con successo!");
                          } catch (e: any) {
                             alert("Errore: " + e.message);
                          }
                       }
                     }}
                     className="w-full px-4 py-2 bg-white border border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition shadow-sm"
                   >
                     Invia Email Reset Password
                   </button>
                 </div>
               )}
            </div>
            
            <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Permessi Granulari</label>
                 <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PERMISSIONS_LABELS).map(([key, label]) => {
                       const pKey = key as keyof typeof DEFAULT_PERMISSIONS;
                       const checked = formData.permissions[pKey];
                       return (
                         <div 
                           key={key} 
                           onClick={() => togglePermission(pKey)}
                           className={`cursor-pointer border rounded-xl p-3 flex items-center gap-2 transition ${checked ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                         >
                           <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                              {checked && <div className="w-2 h-2 bg-white rounded-full" />}
                           </div>
                           <span className="text-sm font-medium">{label}</span>
                         </div>
                       );
                    })}
                 </div>
               </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6 mb-6 space-y-4">
            <h4 className="font-medium text-gray-900">Impostazioni Legacy / Override</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200">
                 <label className="flex items-start gap-3 cursor-pointer">
                   <input
                     type="checkbox"
                     checked={formData.hideFinancials}
                     onChange={(e) => setFormData({...formData, hideFinancials: e.target.checked})}
                     className="mt-1 w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                   />
                   <div className="flex flex-col">
                     <span className="font-medium text-sm">Nascondi Prezzi Globalmente</span>
                     <span className="text-xs text-yellow-700 mt-1">L'operatore non vedrà valori economici.</span>
                   </div>
                 </label>
               </div>
               <div className="p-4 bg-purple-50 text-purple-800 rounded-xl border border-purple-200">
                 <label className="flex items-start gap-3 cursor-pointer">
                   <input
                     type="checkbox"
                     checked={formData.isAdmin}
                     onChange={(e) => setFormData({...formData, isAdmin: e.target.checked})}
                     className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                   />
                   <div className="flex flex-col">
                     <span className="font-medium text-sm">Amministratore Totale</span>
                     <span className="text-xs text-purple-700 mt-1">Ignora permessi, vede e modifica tutto.</span>
                   </div>
                 </label>
               </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
            >
               Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Salva Operatore'}
            </button>
          </div>
        </form>
      )}

      {operators.length === 0 && !loading && !isAdding ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-500">Nessun operatore aggiunto. L'accesso è riservato all'Amministratore principale.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {operators.map((op) => (
            <div key={op.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col hover:border-blue-200 transition">
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                   <div className="flex flex-col gap-1">
                     <h3 className={`font-semibold px-2 py-1 rounded-lg inline-block text-xs w-max ${op.isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-800'}`}>
                       {op.isAdmin ? 'AMMINISTRATORE' : 'PERSONALIZZATO'}
                     </h3>
                   </div>
                   <div className="flex gap-2">
                     <button onClick={() => openEditForm(op)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-lg transition" title="Modifica">
                       <Edit2 size={16} />
                     </button>
                     <button onClick={() => handleDelete(op.id, op.name)} className="p-1.5 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded-lg transition" title="Elimina">
                       <Trash2 size={16} />
                     </button>
                   </div>
                </div>
                <h3 className="font-semibold text-gray-900 truncate mt-2 text-lg">{op.name}</h3>
                <p className="text-sm font-medium text-gray-500 truncate">{op.email}</p>
                
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <div className="flex flex-wrap gap-1">
                    {op.isAdmin ? (
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full uppercase tracking-wider">Accesso Totale</span>
                    ) : (
                      <>
                        {op.permissions?.dashboard && <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Dashboard</span>}
                        {op.permissions?.inventory && <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Scorte</span>}
                        {op.permissions?.orders && <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Ordini</span>}
                        {op.permissions?.parking && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">Parcheggio</span>}
                      </>
                    )}
                    {op.hideFinancials && (
                      <span className="text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full ml-auto">Prezzi Nascosti</span>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
