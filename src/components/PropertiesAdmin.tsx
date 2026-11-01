import React, { useState } from 'react';
import { useSettings } from './SettingsProvider';
import { updateAppSettings, freezeTransactionsHistory } from '../firebase/api';
import { Building, Home, Plus, X, AlertTriangle } from 'lucide-react';

export function PropertiesAdmin() {
  const { settings, loading } = useSettings();
  
  const [newProperty, setNewProperty] = useState('');
  const [newApartment, setNewApartment] = useState('');
  const [selectedPropertyForApartment, setSelectedPropertyForApartment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [freezeMessage, setFreezeMessage] = useState('');
  const [error, setError] = useState('');

  const handleAddProperty = async () => {
    if (!newProperty.trim()) return;
    if (settings.properties.includes(newProperty.trim())) {
      setError("Questa proprietà esiste già.");
      return;
    }
    
    setIsSaving(true);
    setError('');
    try {
      const updatedProperties = [...settings.properties, newProperty.trim()];
      const updatedPropertyApartments = { ...settings.propertyApartments, [newProperty.trim()]: [] };
      
      await updateAppSettings({
        properties: updatedProperties,
        propertyApartments: updatedPropertyApartments
      });
      setNewProperty('');
    } catch (e: any) {
      setError(e.message || "Errore durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddApartment = async () => {
    if (!newApartment.trim()) return;
    if (!selectedPropertyForApartment) {
      setError("Seleziona una proprietà a cui associare l'appartamento.");
      return;
    }
    if (settings.apartments.includes(newApartment.trim())) {
      setError("Questo appartamento esiste già.");
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const updatedApartments = [...settings.apartments, newApartment.trim()];
      const updatedPropertyApartments = { ...settings.propertyApartments };
      if (!updatedPropertyApartments[selectedPropertyForApartment]) {
        updatedPropertyApartments[selectedPropertyForApartment] = [];
      }
      updatedPropertyApartments[selectedPropertyForApartment] = [
        ...updatedPropertyApartments[selectedPropertyForApartment], 
        newApartment.trim()
      ];
      
      const updatedApartmentProperty = { ...settings.apartmentProperty, [newApartment.trim()]: selectedPropertyForApartment };

      await updateAppSettings({
        apartments: updatedApartments,
        propertyApartments: updatedPropertyApartments,
        apartmentProperty: updatedApartmentProperty
      });
      setNewApartment('');
    } catch (e: any) {
      setError(e.message || "Errore durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApartment = async (apartmentToRemove: string, propertyOwner: string) => {
    if (!confirm(`Sei sicuro di voler rimuovere l'appartamento ${apartmentToRemove}? Questo non modificherà i dati passati, ma impedirà di selezionarlo in futuro.`)) return;
    
    setIsSaving(true);
    setError('');
    try {
      const updatedApartments = settings.apartments.filter(a => a !== apartmentToRemove);
      
      const updatedPropertyApartments = { ...settings.propertyApartments };
      updatedPropertyApartments[propertyOwner] = updatedPropertyApartments[propertyOwner].filter(a => a !== apartmentToRemove);
      
      const updatedApartmentProperty = { ...settings.apartmentProperty };
      delete updatedApartmentProperty[apartmentToRemove];

      await updateAppSettings({
        apartments: updatedApartments,
        propertyApartments: updatedPropertyApartments,
        apartmentProperty: updatedApartmentProperty
      });
    } catch (e: any) {
      setError(e.message || "Errore durante la rimozione.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFreezeHistory = async () => {
    if (!window.confirm("Sei sicuro? Questa operazione scriverà la proprietà in modo definitivo su tutti i movimenti vecchi in database, congelandoli in modo permanente.\n\nFallo PRIMA di spostare un appartamento sotto un nuovo proprietario, così le sue vecchie spese rimarranno assegnate alla proprietà originaria.")) {
      return;
    }
    setIsSaving(true);
    try {
      const msg = await freezeTransactionsHistory(settings.apartmentProperty, settings.properties[0]);
      setFreezeMessage(msg);
      setTimeout(() => setFreezeMessage(''), 8000);
    } catch (e: any) {
      setError("Errore: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
     return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Building className="text-blue-600" /> Gestione Proprietà & Appartamenti
        </h2>
        <p className="text-sm text-gray-500 font-medium">Crea nuove proprietà o associa nuovi appartamenti ad esse.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-center gap-2 text-sm font-medium">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Aggiunta Proprietà */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
           <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
             <Plus className="text-blue-500" size={18} /> Aggiungi Nuova Proprietà
           </h3>
           <div className="flex gap-2">
              <input 
                 type="text" 
                 value={newProperty}
                 onChange={e => setNewProperty(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleAddProperty()}
                 placeholder="Nome Proprietario o Proprietà..."
                 className="flex-1 p-2 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button 
                 onClick={handleAddProperty}
                 disabled={isSaving || !newProperty.trim()}
                 className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl disabled:opacity-50 transition"
              >
                 Salva
              </button>
           </div>
        </div>

        {/* Aggiunta Appartamento */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
           <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
             <Home className="text-emerald-500" size={18} /> Nuovo Appartamento
           </h3>
           <div className="flex flex-col gap-3">
              <select 
                 value={selectedPropertyForApartment}
                 onChange={e => setSelectedPropertyForApartment(e.target.value)}
                 className="w-full p-2 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                 <option value="" disabled>Seleziona la proprietà di appartenenza...</option>
                 {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="flex gap-2">
                 <input 
                    type="text" 
                    value={newApartment}
                    onChange={e => setNewApartment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddApartment()}
                    placeholder="Nome Appartamento..."
                    className="flex-1 p-2 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                 />
                 <button 
                    onClick={handleAddApartment}
                    disabled={isSaving || !newApartment.trim() || !selectedPropertyForApartment}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl disabled:opacity-50 transition"
                 >
                    Aggiungi
                 </button>
              </div>
           </div>
        </div>
      </div>

      {/* Albero Proprietà */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
         <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Struttura Attuale</h3>
         </div>
         <div className="p-4 sm:p-6 divide-y divide-gray-100">
            {settings.properties.length === 0 ? (
               <div className="text-gray-400 text-center py-6">Nessuna proprietà configurata.</div>
            ) : settings.properties.map(prop => (
               <div key={prop} className="py-4 first:pt-0 last:pb-0">
                  <div className="font-black text-gray-900 text-lg flex items-center gap-2 mb-3">
                     <Building size={16} className="text-gray-400" /> {prop}
                  </div>
                  <div className="flex flex-wrap gap-2 pl-6">
                     {(!settings.propertyApartments[prop] || settings.propertyApartments[prop].length === 0) ? (
                        <div className="text-sm text-gray-400 italic">Nessun appartamento assegnato</div>
                     ) : settings.propertyApartments[prop].map(apt => (
                        <div key={apt} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                           <Home size={14} className="text-gray-400" /> {apt}
                           <button onClick={() => handleRemoveApartment(apt, prop)} className="text-gray-400 hover:text-red-500 transition ml-1" title="Rimuovi">
                             <X size={14} />
                           </button>
                        </div>
                     ))}
                  </div>
               </div>
            ))}
         </div>
      </div>

       {/* Manutenzione Storico */}
       <div className="bg-orange-50 border border-orange-100 shadow-sm rounded-2xl p-6 mt-6">
          <h3 className="text-lg font-bold text-orange-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="text-orange-500" size={18} /> Sistema di Congelamento Storico (Data Freeze)
          </h3>
          <p className="text-sm text-orange-800 mb-4 font-medium leading-relaxed">
             Se stai per trasferire un appartamento sotto un nuovo proprietario, usa questo comando prima di cambiare la proprietà per "fissare" in modo permanente nei database tutti i vecchi movimenti (es. consumi Housekeeping) sotto l'attuale proprietario. Così facendo i vecchi report non cambieranno mai proprietà. Le finanze (Cashflow) sono già assegnate nativamente.
          </p>
          <div className="flex items-center gap-4">
            <button 
               onClick={handleFreezeHistory}
               disabled={isSaving}
               className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-6 rounded-xl disabled:opacity-50 transition shadow-sm"
            >
               Congela Storico Ora
            </button>
            {freezeMessage && <span className="text-sm font-bold text-orange-700 bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200">{freezeMessage}</span>}
          </div>
       </div>

    </div>
  );
}
