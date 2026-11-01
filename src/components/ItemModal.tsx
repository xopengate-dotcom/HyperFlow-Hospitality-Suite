import React, { useState, useEffect } from 'react';
import { Item, CatalogItem } from '../types';
import { addItem, updateItem, getCatalogItemByBarcode, getCatalogItems, addCatalogItem } from '../firebase/api';
import { X, Loader2, TriangleAlert, Info, ScanBarcode, Library, Search } from 'lucide-react';
import { useAuthContext } from './Auth';
import { useSettings } from './SettingsProvider';
import { BarcodeScanner } from './BarcodeScanner';
import { OnlineProductSearchModal } from './OnlineProductSearchModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  item?: Item;
  existingCategories: string[];
  defaultProperty: string;
  initialBarcode?: string;
}

export function ItemModal({ isOpen, onClose, onSaved, item, existingCategories, defaultProperty, initialBarcode }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [quantity, setQuantity] = useState('0');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('pz');
  const [minQuantity, setMinQuantity] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [barcode, setBarcode] = useState('');
  const [showInHousekeeping, setShowInHousekeeping] = useState(false);
  const [visibleInApartments, setVisibleInApartments] = useState<string[]>([]);
  const [itemProperty, setItemProperty] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isOnlineSearchOpen, setIsOnlineSearchOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);

  const { hideFinancials, isAdmin } = useAuthContext();
  const { settings } = useSettings();

  const fetchProductName = async (scannedBarcode: string) => {
    // 1. Check local catalog first
    const catalogMatch = await getCatalogItemByBarcode(scannedBarcode);
    if (catalogMatch) {
      applyCatalogItem(catalogMatch);
      return;
    }

    // 2. Not found in catalog, try external APIs
    const apis = [
      'https://world.openfoodfacts.org/api/v2/product/',
      'https://world.openproductsfacts.org/api/v2/product/',
      'https://world.openbeautyfacts.org/api/v2/product/'
    ];

    for (const baseUrl of apis) {
      try {
        const response = await fetch(`${baseUrl}${scannedBarcode}.json`);
        const data = await response.json();
        if (data.status === 1 && data.product) {
          const productName = data.product.product_name || data.product.product_name_it || data.product.generic_name;
          if (productName) {
               setName(productName);
               return; // Trovato, usciamo dalo loop
          }
        }
      } catch (e) {
        console.error(`Errore API ${baseUrl}:`, e);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      getCatalogItems().then(items => setCatalogItems(items)).catch(console.error);
      
      if (item) {
        setName(item.name);
        setCategory(item.category);
        setIsNewCategory(false);
        setQuantity(item.quantity.toString());
        setPrice(item.price !== undefined ? item.price.toString() : '');
        setUnit(item.unit);
        setMinQuantity(item.minQuantity !== undefined ? item.minQuantity.toString() : '');
        setImageUrl(item.imageUrl || '');
        setBarcode(item.barcode || '');
        setShowInHousekeeping(item.showInHousekeeping || false);
        setVisibleInApartments(item.visibleInApartments || []);
        setItemProperty(item.property || (defaultProperty === 'Tutte le Proprietà' ? '' : defaultProperty));
      } else {
        setName('');
        setCategory(existingCategories.length > 0 ? existingCategories[0] : 'Altro');
        setIsNewCategory(false);
        setQuantity('0');
        setPrice('');
        setUnit('pz');
        setMinQuantity('');
        setImageUrl('');
        setBarcode(initialBarcode || '');
        setShowInHousekeeping(false);
        setVisibleInApartments([]);
        setItemProperty(defaultProperty === 'Tutte le Proprietà' ? '' : defaultProperty);
        if (initialBarcode) {
          fetchProductName(initialBarcode);
          setQuantity('1');
        }
      }
      setError('');
    }
  }, [isOpen, item, existingCategories, initialBarcode]);

  if (!isOpen) return null;

  const handleBarcodeScanned = async (scannedBarcode: string) => {
    setIsScanning(false);
    setBarcode(scannedBarcode);
    await fetchProductName(scannedBarcode);
    if (!item) {
      setQuantity((prev) => {
        const num = parseFloat(prev);
        if (isNaN(num)) return '1';
        return (num + 1).toString();
      });
    }
  };

  const applyCatalogItem = (cItem: CatalogItem) => {
    setName(cItem.name);
    setCategory(cItem.category);
    setIsNewCategory(false);
    setUnit(cItem.unit);
    if (cItem.imageUrl) setImageUrl(cItem.imageUrl);
    if (cItem.barcode) setBarcode(cItem.barcode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const parsedQty = Number(quantity);
      if (isNaN(parsedQty) || (parsedQty < 0 && !['Biancheria', 'noleggio', 'Noleggio', 'NOLEGGIO'].includes(category))) {
        throw new Error("Quantità non valida per questa categoria");
      }
      
      const parsedPrice = price ? Number(price.toString().replace(',', '.')) : undefined;
      if (parsedPrice !== undefined && (isNaN(parsedPrice) || parsedPrice < 0)) {
        throw new Error("Prezzo non valido");
      }

      const parsedMinQuantity = minQuantity ? Number(minQuantity) : 0;
      if (isNaN(parsedMinQuantity) || parsedMinQuantity < 0) {
        throw new Error("Quantità minima non valida");
      }

      if (item) {
        await updateItem(item.id, {
          property: itemProperty || undefined,
          name,
          category,
          quantity: parsedQty,
          unit,
          price: hideFinancials ? item.price : parsedPrice,
          minQuantity: parsedMinQuantity,
          imageUrl: imageUrl.trim() || undefined,
          barcode: barcode.trim() || undefined,
          showInHousekeeping,
          visibleInApartments: showInHousekeeping ? visibleInApartments : []
        });
      } else {
        await addItem({
          property: itemProperty || undefined,
          name,
          category,
          quantity: parsedQty,
          unit,
          price: hideFinancials ? undefined : parsedPrice,
          minQuantity: parsedMinQuantity,
          imageUrl: imageUrl.trim() || undefined,
          barcode: barcode.trim() || undefined,
          showInHousekeeping,
          visibleInApartments: showInHousekeeping ? visibleInApartments : []
        });

        const existsInCatalog = catalogItems.some(c => c.name.toLowerCase() === name.toLowerCase());
        if (!existsInCatalog) {
          try {
            await addCatalogItem({
              name,
              category,
              unit,
              barcode: barcode.trim() || undefined,
              imageUrl: imageUrl.trim() || undefined
            });
          } catch (e) {
            console.error("Non sono riuscito a creare il prodotto in anagrafica: ", e);
          }
        }
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-white flex justify-between items-center p-4 border-b border-gray-100 z-10 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">
            {item ? 'Modifica Articolo' : 'Nuovo Articolo'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition">
            <X size={20} />
          </button>
        </div>

        <form id="item-form" onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proprietà</label>
            <select
              value={itemProperty}
              onChange={e => setItemProperty(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition text-gray-900"
            >
              <option value="">(Nessuna Proprietà / Uso Comune)</option>
              {settings.properties.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Codice a Barre (Opzionale)</label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={100}
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition"
                placeholder="es. 8000000000000"
              />
              <button
                type="button"
                onClick={() => setIsScanning(true)}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 flex items-center justify-center transition shrink-0"
                title="Scansiona Barcode"
              >
                <ScanBarcode className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="flex justify-between items-center mb-1">
               <label className="block text-sm font-medium text-gray-700">Nome Articolo</label>
               <button type="button" onClick={() => setIsOnlineSearchOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition">
                  <Search size={12}/> Cerca Online
               </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition"
                placeholder="Cerca da anagrafica o inserisci nuovo..."
                autoFocus
              />
              {!item && catalogItems.length > 0 && (
                <select
                  className="w-48 shrink-0 px-2 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm text-gray-700 cursor-pointer"
                  onChange={(e) => {
                    const found = catalogItems.find(c => c.id === e.target.value);
                    if (found) { applyCatalogItem(found); setShowSuggestions(false); }
                    e.target.value = "";
                  }}
                  value=""
                  title="Sfoglia tutta l'anagrafica"
                >
                  <option value="">Anagrafica...</option>
                  {catalogItems.sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            {showSuggestions && !item && catalogItems.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {catalogItems
                  .filter(c => c.name.toLowerCase().includes(name.toLowerCase()) || (c.barcode && c.barcode.includes(name)))
                  .map(c => (
                    <div
                      key={c.id}
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50 last:border-0"
                      onClick={() => {
                        applyCatalogItem(c);
                        setShowSuggestions(false);
                      }}
                    >
                      <div className="font-semibold text-gray-900">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.category} • {c.unit}{c.barcode ? ` • 🏷️ ${c.barcode}` : ''}</div>
                    </div>
                  ))}
                  {name.length > 0 && catalogItems.filter(c => c.name.toLowerCase().includes(name.toLowerCase()) || (c.barcode && c.barcode.includes(name))).length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500 italic text-center">Nessun articolo in anagrafica. Verrà creato come nuovo.</div>
                  )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-col sm:flex-row">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              {isNewCategory ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Nuova categoria"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewCategory(false);
                      setCategory(existingCategories[0] || 'Altro');
                    }}
                    className="p-2 text-gray-500 hover:text-gray-700 font-medium whitespace-nowrap"
                  >
                    Annulla
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={e => {
                    if (e.target.value === '__NEW__') {
                      setIsNewCategory(true);
                      setCategory('');
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 transition"
                >
                  {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__NEW__" className="font-semibold text-blue-600">+ Crea nuova categoria...</option>
                </select>
              )}
            </div>

            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Unità</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 transition"
              >
                <option value="pz">pz</option>
                <option value="litri">litri</option>
                <option value="kg">kg</option>
                <option value="scatole">scatole</option>
                <option value="rotoli">rotoli</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giacenza Iniziale / Attuale</label>
              <input
                type="number"
                required
                step="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                disabled={!!item && !isAdmin}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 bg-gray-50 focus:bg-white transition"
                placeholder="0"
              />
              {item && !isAdmin && <p className="text-xs text-gray-400 mt-1">Usa Carico/Scarico sulla riga.</p>}
              {item && isAdmin && <p className="text-xs text-orange-500 mt-1">Modifica diretta admin.</p>}
            </div>

             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>Scorta Minima</span>
                  <TriangleAlert size={14} className="text-orange-400" title="Avviso Sottoscorta" />
               </label>
               <input
                 type="number"
                 min="0"
                 step="1"
                 value={minQuantity}
                 onChange={e => setMinQuantity(e.target.value)}
                 className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition"
                 placeholder="0"
               />
             </div>
          </div>

          <div>
            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition bg-white mt-2">
              <input
                type="checkbox"
                checked={showInHousekeeping}
                onChange={(e) => setShowInHousekeeping(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">Visibilità in Housekeeping</span>
                <span className="text-xs text-gray-500">Mostra questo articolo nell'elenco consumi del modulo Housekeeping</span>
              </div>
            </label>
            {showInHousekeeping && (
              <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <p className="text-sm font-medium text-gray-700">Visibile in questi appartamenti:</p>
                <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setVisibleInApartments([])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${visibleInApartments.length === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                     >
                       Predefinito (Appartamenti associati)
                    </button>
                    <button 
                      type="button"
                      onClick={() => setVisibleInApartments(settings.apartments)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${visibleInApartments.length === settings.apartments.length ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                     >
                       Tutti gli Appartamenti (Fornitore)
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {settings.apartments.map(apt => (
                    <label key={apt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-white p-2 border border-gray-100 rounded-lg shadow-sm hover:shadow transition">
                      <input 
                        type="checkbox" 
                        checked={visibleInApartments.includes(apt)}
                        onChange={(e) => {
                           if (e.target.checked) {
                             setVisibleInApartments(prev => [...prev, apt]);
                           } else {
                             setVisibleInApartments(prev => prev.filter(a => a !== apt));
                           }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span className="truncate">{apt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-5 space-y-4">
             {!hideFinancials && (
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                   Costo Unitario
                   <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Admin Only</span>
                 </label>
                 <div className="relative">
                   <span className="absolute left-4 top-2.5 text-gray-500">€</span>
                   <input
                     type="text"
                     inputMode="decimal"
                     value={price !== undefined ? String(price).replace('.', ',') : ''}
                     onChange={e => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                     className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-300 bg-gray-50 focus:bg-white transition"
                     placeholder="0,00"
                   />
                 </div>
               </div>
             )}
             {hideFinancials && (
               <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2">
                  <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-800">Costi e valori finanziari sono nascosti per il tuo profilo. Eventuali prezzi salvati non verranno modificati.</p>
               </div>
             )}

             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Immagine (URL)</label>
               <input
                 type="url"
                 value={imageUrl}
                 onChange={e => setImageUrl(e.target.value)}
                 className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-300 bg-gray-50 focus:bg-white transition"
                 placeholder="https://esempio.com/foto.jpg"
               />
               {imageUrl && (
                 <div className="mt-2 text-center">
                    <p className="text-xs text-gray-500 mb-1">Anteprima</p>
                    <img src={imageUrl} alt="Anteprima" className="h-16 w-16 object-cover rounded-lg border border-gray-200 mx-auto" onError={(e) => (e.currentTarget.style.display = 'none')} />
                 </div>
               )}
             </div>
          </div>
        </form>

        <div className="p-4 border-t border-gray-100 flex gap-3 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition font-medium"
          >
            Annulla
          </button>
          <button
            type="submit"
            form="item-form"
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex justify-center items-center font-medium shadow-sm"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salva'}
          </button>
        </div>
      </div>

      {isScanning && (
        <BarcodeScanner
          onScan={handleBarcodeScanned}
          onClose={() => setIsScanning(false)}
        />
      )}

      <OnlineProductSearchModal
        isOpen={isOnlineSearchOpen}
        onClose={() => setIsOnlineSearchOpen(false)}
        onSelect={(p: any) => {
          if (p.name) setName(p.name);
          if (p.barcode) setBarcode(p.barcode);
          if (p.imageUrl) setImageUrl(p.imageUrl);
        }}
      />
    </div>
  );
}
