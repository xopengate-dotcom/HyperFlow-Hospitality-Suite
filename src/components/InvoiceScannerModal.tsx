import React, { useState } from 'react';
import { RefreshCw, UploadCloud, X, Check, AlertCircle } from 'lucide-react';
import { Item } from '../types';
import { getItems, addItem, addTransaction, updateItem } from '../firebase/api';

interface ExtractedItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
  barcode?: string;
  category?: string;
}

interface MatchResult extends ExtractedItem {
  matchedItem?: Item; // existing item found by name or barcode
  selected: boolean;
}

const compressImage = (file: File, maxWidthOrHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidthOrHeight) {
            height = Math.round((height * maxWidthOrHeight) / width);
            width = maxWidthOrHeight;
          }
        } else {
          if (height > maxWidthOrHeight) {
            width = Math.round((width * maxWidthOrHeight) / height);
            height = maxWidthOrHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context non disponibile'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl.split(',')[1]); 
      };
      img.onerror = () => reject(new Error("Errore nel caricamento dell'immagine"));
    };
    reader.onerror = () => reject(new Error("Errore nella lettura del file"));
  });
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted: () => void;
  selectedProperty: string;
}

export function InvoiceScannerModal({ isOpen, onClose, onImportCompleted, selectedProperty }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractedItems, setExtractedItems] = useState<MatchResult[]>([]);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [importing, setImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleProcessInvoice = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    
    try {
      // Convert and compress file to base64
      const base64Data = await compressImage(file, 1600);

      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: base64Data,
          mimeType: file.type
        }),
      });

      if (!response.ok) {
        let errMessage = await response.text();
        let rawResponse = errMessage;
        try {
          const errObj = JSON.parse(errMessage);
          if (errObj.error) errMessage = errObj.error + (errObj.details ? ' ' + errObj.details : '');
        } catch (e) {
          // ignore parsing error
        }
        
        // Aggiungiamo un log di errore visibile nella console
        try {
          const { logger } = await import('../utils/logger');
          logger.error('Scanner', `Errore status ${response.status} da /api/extract-invoice`, { responseText: rawResponse.substring(0, 500) });
        } catch (logErr) {}

        throw new Error(errMessage);
      }

      const data = await response.json();
      const parsedItems: ExtractedItem[] = data.items || [];

      // Fetch current items to find matches
      const currentItems = await getItems();
      const activeItems = currentItems.filter(i => (i.property || 'Tutte le Proprietà') === selectedProperty);

      const results: MatchResult[] = parsedItems.map(p => {
        // Find match by barcode or name
        const match = activeItems.find(i => 
          (p.barcode && i.barcode === p.barcode) || 
          (i.name.toLowerCase().trim() === p.name.toLowerCase().trim())
        );
        return {
          ...p,
          price: Number(p.price) || 0,
          quantity: Number(p.quantity) || 0,
          matchedItem: match,
          selected: true
        };
      });

      setExtractedItems(results);
      setStep('review');
    } catch (err: any) {
      console.error(err);
      try {
        const { logger } = await import('../utils/logger');
        logger.error('Scanner', `Eccezione Scanner: ${err.message || err.toString()}`, { stack: err.stack });
      } catch (logErr) {}
      setError(`Errore analisi: ${err.message || err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const selectedItems = extractedItems.filter(i => i.selected);
      for (const item of selectedItems) {
        if (item.matchedItem) {
          // Add quantity to existing using addTransaction which natively updates the item quantity
          await addTransaction(item.matchedItem, 'in', item.quantity, undefined, `Carico da fattura (Proprietà: ${selectedProperty})`);
        } else {
          // Generate internal barcode if missing
          const itemBarcode = item.barcode || `INT-${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;
          
          // Create new - addItem natively sets the specified quantity
          await addItem({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            unit: item.unit || 'pz',
            barcode: itemBarcode,
            category: item.category || 'Altro',
            property: selectedProperty,
          } as any);
        }
      }
      onImportCompleted();
      onClose();
    } catch (err: any) {
       alert("Errore durante l'importazione: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">Importa Fattura (AI Scanner)</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto w-full">
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl p-10 bg-gray-50 hover:bg-gray-100 transition text-center hover:border-blue-300">
              <UploadCloud size={48} className="text-blue-500 mb-4" />
              <p className="text-gray-900 font-bold text-lg mb-2">Carica foto o scansione fattura</p>
              <p className="text-gray-500 text-sm mb-6 max-w-sm">Scatta una foto chiara o carica un'immagine della fattura. L'IA analizzerà i prodotti per inserirli a magazzino.</p>
              <label className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition shadow-sm cursor-pointer inline-flex items-center gap-2">
                Scegli File
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
              {file && (
                <div className="mt-4 text-sm font-medium text-emerald-600 flex flex-col items-center gap-2">
                  <span>File selezionato: {file.name}</span>
                  <button 
                    onClick={handleProcessInvoice}
                    disabled={loading}
                    className="mt-2 px-6 py-2 bg-emerald-600 text-white font-bold hover:bg-emerald-700 rounded-xl transition cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                    {loading ? 'Analisi in corso...' : 'Analizza e Estrai'}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4 w-full">
              <p className="text-sm text-gray-500 font-medium">Controlla gli articoli estratti prima di confermare. Gli articoli esistenti verranno incrementati.</p>
              <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                <table className="min-w-full text-left text-sm text-gray-600">
                   <thead className="bg-gray-50 border-b border-gray-100 font-medium text-xs uppercase tracking-wider">
                     <tr>
                        <th className="p-3 w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={extractedItems.length > 0 && extractedItems.every(i => i.selected)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setExtractedItems(items => items.map(item => ({ ...item, selected: checked })));
                            }}
                          />
                        </th>
                        <th className="p-3">Prodotto</th>
                        <th className="p-3">Quantità</th>
                        <th className="p-3">Prezzo Unit.</th>
                        <th className="p-3">Stato</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {extractedItems.map((item, i) => (
                      <tr key={i} className={`hover:bg-gray-50/50 ${!item.selected ? 'opacity-50 grayscale' : ''}`}>
                         <td className="p-3">
                            <input 
                              type="checkbox"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={item.selected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setExtractedItems(items => items.map((it, idx) => idx === i ? { ...it, selected: checked } : it));
                              }}
                            />
                         </td>
                         <td className="p-3">
                           <div className="font-bold text-gray-900">{item.name}</div>
                           {item.barcode && <div className="text-xs text-gray-400">EAN: {item.barcode}</div>}
                           {!item.barcode && !item.matchedItem && <div className="text-xs text-orange-500">Codice interno auto-generato</div>}
                         </td>
                         <td className="p-3 font-semibold">{item.quantity} {item.unit}</td>
                         <td className="p-3 text-gray-600 font-medium whitespace-nowrap">
                           € {(Number(item.price) || 0).toFixed(2)}
                         </td>
                         <td className="p-3">
                           {item.matchedItem ? (
                             <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded">
                               Integra scorta ({item.matchedItem.quantity} → {item.matchedItem.quantity + item.quantity})
                             </span>
                           ) : (
                             <span className="text-blue-600 font-medium text-xs bg-blue-50 px-2 py-1 rounded">
                               Nuovo Articolo
                             </span>
                           )}
                         </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
               <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 px-6 pb-6">
                 <button onClick={() => setStep('upload')} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition cursor-pointer">
                    Indietro
                 </button>
                 <button 
                   onClick={handleImport}
                   disabled={importing}
                   className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition cursor-pointer flex items-center gap-2"
                 >
                   {importing ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                   {importing ? 'Importazione...' : 'Conferma e Importa'}
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
