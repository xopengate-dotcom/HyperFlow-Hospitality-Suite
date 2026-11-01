import React, { useState } from 'react';
import { Search, Loader2, X, Image as ImageIcon } from 'lucide-react';

interface ProductMatch {
  name: string;
  barcode: string;
  imageUrl?: string;
  source?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: { name: string; barcode?: string; imageUrl?: string }) => void;
}

export function OnlineProductSearchModal({ isOpen, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductMatch[]>([]);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const isBarcode = /^\d+$/.test(query.trim());
      const apis = [
        'https://world.openfoodfacts.org',
        'https://world.openproductsfacts.org',
        'https://world.openbeautyfacts.org'
      ];
      let promises: Promise<any>[];

      if (isBarcode) {
        const barcode = query.trim();
        const barcodesToTry = [barcode];
        if (barcode.length === 8) {
          // A volte gli EAN-8 sono salvati come EAN-13 padding con zeri
          barcodesToTry.push(barcode.padStart(13, '0'));
        }

        promises = apis.flatMap(baseUrl => 
          barcodesToTry.map(bc =>
            fetch(`${baseUrl}/api/v0/product/${bc}.json`, {
               headers: { 'Accept': 'application/json' }
            })
            .then(res => res.json())
            .then(data => {
              if (data.status === 1 && data.product) {
                 return { products: [data.product] };
              }
              return { products: [] };
            })
            .catch(() => ({ products: [] }))
          )
        );
      } else {
        promises = apis.map(baseUrl => 
          fetch(`${baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=true&page_size=15`, {
             headers: { 'Accept': 'application/json' }
          })
          .then(res => res.json())
          .catch(() => ({ products: [] }))
        );
      }

      const responses = await Promise.all(promises);
      
      const combined: ProductMatch[] = [];
      const seen = new Set<string>();

      responses.forEach((data, index) => {
        if (data && data.products) {
          data.products.forEach((p: any) => {
             const name = p.product_name || p.product_name_it || p.generic_name;
             if (name && p.code && !seen.has(p.code)) {
               seen.add(p.code);
               combined.push({
                 name,
                 barcode: p.code,
                 imageUrl: p.image_front_url || p.image_url,
                 source: apis[index]
               });
             }
          });
        }
      });

      setResults(combined);
      if (combined.length === 0) {
         setError('Nessun prodotto trovato. Prova con altri termini.');
      }
    } catch (err: any) {
      setError('Errore durante la ricerca. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Search className="text-blue-600" size={24} />
            Ricerca Prodotto Online
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto shrink-0 border-b border-gray-100">
           <form onSubmit={handleSearch} className="flex gap-2">
             <input
               type="text"
               value={query}
               onChange={e => setQuery(e.target.value)}
               placeholder="Cerca nome prodotto o inserisci barcode..."
               className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400"
               autoFocus
             />
             <button
               type="submit"
               disabled={loading || !query.trim()}
               className="px-6 py-3 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center shadow-sm cursor-pointer disabled:opacity-50"
             >
               {loading ? <Loader2 size={20} className="animate-spin" /> : 'Cerca'}
             </button>
           </form>
           {error && <div className="text-sm text-red-600 font-medium">{error}</div>}
        </div>

        <div className="p-6 overflow-y-auto bg-gray-50/30 flex-1">
           {results.length > 0 ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                       onSelect({ name: r.name, barcode: r.barcode, imageUrl: r.imageUrl });
                       onClose();
                    }}
                    className="flex text-left gap-3 p-3 bg-white border border-gray-200 rounded-2xl hover:border-blue-500 hover:shadow-md transition items-center"
                  >
                    <div className="w-16 h-16 shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                       {r.imageUrl ? <img src={r.imageUrl} alt={r.name} className="w-full h-full object-contain" loading="lazy" /> : <ImageIcon size={24}/>}
                    </div>
                    <div className="flex-1 overflow-hidden min-w-0">
                       <div className="font-bold text-sm text-gray-900 line-clamp-2 leading-tight">{r.name}</div>
                       <div className="text-xs text-gray-500 font-medium truncate mt-1">EAN: {r.barcode}</div>
                    </div>
                  </button>
                ))}
             </div>
           ) : (
             !loading && !error && query && (
               <div className="text-center text-gray-500 py-8">Nessun risultato. Inizia la ricerca.</div>
             )
           )}
        </div>
      </div>
    </div>
  );
}
