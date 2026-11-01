import React, { useState, useEffect } from 'react';
import { CatalogItem } from '../types';
import { addCatalogItem, updateCatalogItem } from '../firebase/api';
import { X, Loader2, ScanBarcode, Search } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { OnlineProductSearchModal } from './OnlineProductSearchModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  item?: CatalogItem;
  existingCategories: string[];
}

export function CatalogItemModal({ isOpen, onClose, onSaved, item, existingCategories }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [unit, setUnit] = useState('pz');
  const [imageUrl, setImageUrl] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isOnlineSearchOpen, setIsOnlineSearchOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchProductName = async (scannedBarcode: string) => {
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
               return; // Trovato, usciamo dal loop
          }
        }
      } catch (e) {
        console.error(`Errore API ${baseUrl}:`, e);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setName(item.name);
        setCategory(item.category);
        setIsNewCategory(false);
        setUnit(item.unit || 'pz');
        setImageUrl(item.imageUrl || '');
        setBarcode(item.barcode || '');
      } else {
        setName('');
        setCategory(existingCategories.length > 0 ? existingCategories[0] : 'Altro');
        setIsNewCategory(false);
        setUnit('pz');
        setImageUrl('');
        setBarcode('');
      }
      setError('');
    }
  }, [isOpen, item, existingCategories]);

  if (!isOpen) return null;

  const handleBarcodeScanned = async (scannedBarcode: string) => {
    setIsScanning(false);
    setBarcode(scannedBarcode);
    await fetchProductName(scannedBarcode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (item) {
        await updateCatalogItem(item.id, {
          name,
          category,
          unit,
          imageUrl: imageUrl.trim() || undefined,
          barcode: barcode.trim() || undefined
        });
      } else {
        await addCatalogItem({
          name,
          category,
          unit,
          imageUrl: imageUrl.trim() || undefined,
          barcode: barcode.trim() || undefined
        });
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
            {item ? 'Modifica Articolo in Anagrafica' : 'Nuovo Articolo in Anagrafica'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition">
            <X size={20} />
          </button>
        </div>

        <form id="catalog-item-form" onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>}

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

          <div>
            <div className="flex justify-between items-center mb-1">
               <label className="block text-sm font-medium text-gray-700">Nome Articolo</label>
               <button type="button" onClick={() => setIsOnlineSearchOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition">
                  <Search size={12}/> Cerca Online
               </button>
            </div>
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition"
              placeholder="es. Bagnoschiuma 5L"
              autoFocus
            />
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
                      setCategory(existingCategories.length > 0 ? existingCategories[0] : 'Altro');
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
                  {existingCategories.length === 0 && <option value="Generale">Generale</option>}
                  <option value="__NEW__" className="font-semibold text-blue-600">+ Crea nuova categoria...</option>
                </select>
              )}
            </div>

            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Unità base</label>
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
            form="catalog-item-form"
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex justify-center items-center font-medium shadow-sm"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salva in Anagrafica'}
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
