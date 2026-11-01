import React, { useState, useEffect } from 'react';
import { CatalogItem } from '../types';
import { getCatalogItems, deleteCatalogItem, importCatalogFromItems } from '../firebase/api';
import { Plus, Search, Edit2, Trash2, Library, Loader2, DownloadCloud } from 'lucide-react';
import { CatalogItemModal } from './CatalogItemModal';
import { useAuthContext } from './Auth';

export function Catalog() {
  const { isAdmin, role, user } = useAuthContext();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | undefined>(undefined);

  const loadData = async () => {
    setLoading(true);
    try {
      const catalogItems = await getCatalogItems();
      setItems(catalogItems);
    } catch (e) {
      console.error(e);
      alert('Errore nel caricamento anagrafica');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Sei sicuro di voler eliminare ${name} dall'anagrafica?`)) {
      setLoading(true);
      try {
        await deleteCatalogItem(id);
        await loadData();
      } catch (err: any) {
        alert("Errore durante l'eliminazione: " + err.message);
        setLoading(false);
      }
    }
  };

  const handleImport = async () => {
    if (confirm('Vuoi scansionare l\'intero inventario e copiare gli articoli mancanti (per nome) nell\'anagrafica?\nL\'operazione potrebbe richiedere alcuni secondi.')) {
      setImporting(true);
      try {
        const added = await importCatalogFromItems(user?.uid || 'admin');
        alert(`Importazione completata.\nSono stati aggiunti ${added} nuovi articoli all'anagrafica.`);
        await loadData();
      } catch (error: any) {
        alert("Errore durante l'importazione: " + error.message);
        console.error(error);
      } finally {
        setImporting(false);
      }
    }
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.barcode && i.barcode.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Library className="text-blue-600" /> Anagrafica Articoli
          </h2>
          <p className="text-gray-500 text-sm mt-1">Gestisci il catalogo maestro dei prodotti</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {isAdmin && (
            <button
              onClick={handleImport}
              disabled={loading || importing}
              className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition disabled:opacity-50"
              title="Importa da articoli in magazzino"
            >
              {importing ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />} 
              <span className="text-sm sm:text-base">Importa</span>
            </button>
          )}
          <button
            onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition"
          >
            <Plus size={18} className="shrink-0" />
            <span className="text-sm sm:text-base whitespace-nowrap">Nuovo Articolo</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500 transition">
          <Search className="text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Cerca per nome, categoria o barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-gray-700 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center p-12">
            <Library className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Nessun articolo trovato</h3>
            <p className="text-gray-500 mt-1">Aggiungi articoli all'anagrafica per ritrovarli facilmente negli inventari.</p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap w-14">Immagine</th>
                  <th className="p-3 sm:p-4 font-medium">Nome</th>
                  <th className="p-3 sm:p-4 font-medium hidden md:table-cell">Categoria</th>
                  <th className="p-3 sm:p-4 font-medium hidden lg:table-cell">Codice a Barre</th>
                  <th className="p-3 sm:p-4 relative text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition lg:group">
                    <td className="p-3 sm:p-4 w-16">
                      {item.imageUrl ? (
                        <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-white shadow-sm flex items-center justify-center">
                          <img src={item.imageUrl} alt={item.name} className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                          <Library className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="p-3 sm:p-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate text-sm sm:text-base">{item.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Unità: {item.unit}
                          <span className="md:hidden inline-block ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">
                            {item.category}
                          </span>
                        </div>
                        {item.barcode && (
                          <div className="lg:hidden text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-[120px]">
                            {item.barcode}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 sm:p-4 hidden md:table-cell">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium border border-gray-200/50 whitespace-nowrap">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 font-mono text-xs text-gray-500 hidden lg:table-cell max-w-[150px] truncate">
                      {item.barcode || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-3 sm:p-4 text-right align-middle">
                      <div className="flex justify-end gap-1 sm:gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Modifica"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Elimina"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CatalogItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadData}
        item={editingItem}
        existingCategories={Array.from(new Set(items.map(i => i.category).filter(Boolean) as string[])).sort()}
      />
    </div>
  );
}
