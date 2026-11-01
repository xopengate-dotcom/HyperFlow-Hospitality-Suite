import React, { useState, useEffect } from 'react';
import { Item, RestockOrder, RestockOrderItem, CatalogItem } from '../types';
import { getItems, getRestockOrders, addRestockOrder, updateRestockOrder, deleteRestockOrder, purchaseRestockOrder, fulfillRestockOrder, updateRestockOrderDate, getCatalogItems, addItem } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { useAuthContext } from './Auth';
import { ShoppingCart, Share2, Search, ArrowLeft, CheckCircle2, RotateCcw, AlertTriangle, PackageOpen, Edit2, Trash2, X, Check, Printer, Loader2, Library } from 'lucide-react';

interface OrdersProps {
  autoFill?: 'esauriti' | 'sottoscorta';
}

export function Orders({ autoFill }: OrdersProps) {
  const { settings, loading: settingsLoading } = useSettings();
  const { role, isAdmin } = useAuthContext();
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState('');

  useEffect(() => {
    if (settings.properties.length > 0 && !selectedProperty) {
      setSelectedProperty(settings.properties[0]);
    }
  }, [settings.properties, selectedProperty]);
  
  // Specific order from URL if present
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // Build mode (Marco)
  const [isBuilding, setIsBuilding] = useState(false);
  const [cart, setCart] = useState<RestockOrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderError, setOrderError] = useState('');
  const [addingFromCatalog, setAddingFromCatalog] = useState<string | null>(null);
  const [hasAutoFilled, setHasAutoFilled] = useState(false);

  useEffect(() => {
    if (autoFill && !hasAutoFilled && !loading && items.length > 0) {
      const prop = selectedProperty || settings.properties[0];
      const fItems = items.filter(i => (i.property || settings.properties[0]) === prop);
      
      let toAdd: Item[] = [];
      if (autoFill === 'esauriti') {
        toAdd = fItems.filter(i => i.quantity === 0);
      } else if (autoFill === 'sottoscorta') {
        toAdd = fItems.filter(i => i.minQuantity !== undefined && i.quantity > 0 && i.quantity <= i.minQuantity);
      }

      if (toAdd.length > 0) {
        setIsBuilding(true);
        const newCart = toAdd.map(item => {
          let req = 1;
          if (item.minQuantity && item.minQuantity > 0) {
             req = (item.minQuantity - item.quantity) + 1;
             if (req < 1) req = 1;
          }
          return {
            itemId: item.id,
            itemName: item.name,
            quantityRequested: req
          };
        });
        setCart(newCart);
      }
      setHasAutoFilled(true);
    }
  }, [autoFill, hasAutoFilled, loading, items, selectedProperty, settings.properties]);

  const canCreate = isAdmin || role === 'magazzino';
  const canPurchase = isAdmin || role === 'acquisti';

  const loadData = async () => {
    try {
      const [i, o, c] = await Promise.all([getItems(), getRestockOrders(), getCatalogItems()]);
      setItems(i);
      setOrders(o);
      setCatalogItems(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    const ord = params.get('order');
    if (ord) {
      setActiveOrderId(ord);
    }
  }, []);

  useEffect(() => {
    const handleNetworkOnline = () => {
      loadData();
    };
    window.addEventListener('app-network-online', handleNetworkOnline);
    return () => window.removeEventListener('app-network-online', handleNetworkOnline);
  }, []);

  const filteredItemsByProperty = items.filter(i => (i.property || settings.properties[0]) === selectedProperty);
  const filteredOrdersByProperty = orders.filter(o => (o.property || settings.properties[0]) === selectedProperty);

  const handleAddToCart = (item: Item) => {
    setOrderError('');
    setCart(prev => {
      const existing = prev.find(p => p.itemId === item.id);
      if (existing) {
        return prev.map(p => p.itemId === item.id ? { ...p, quantityRequested: p.quantityRequested + 1 } : p);
      }
      return [...prev, { itemId: item.id, itemName: item.name, quantityRequested: 1 }];
    });
  };

  const handleAddCatalogItemToCart = async (catalogItem: CatalogItem) => {
    setOrderError('');
    setAddingFromCatalog(catalogItem.id);
    try {
      const newId = await addItem({
         property: selectedProperty,
         name: catalogItem.name,
         category: catalogItem.category,
         quantity: 0,
         unit: catalogItem.unit,
         barcode: catalogItem.barcode,
         imageUrl: catalogItem.imageUrl
      });
      const newItem: Item = {
         id: newId,
         property: selectedProperty,
         name: catalogItem.name,
         category: catalogItem.category,
         quantity: 0,
         unit: catalogItem.unit,
         barcode: catalogItem.barcode,
         imageUrl: catalogItem.imageUrl,
         createdAt: new Date(),
         updatedAt: new Date()
      };
      setItems(prev => [...prev, newItem]);
      handleAddToCart(newItem);
    } catch (e: any) {
      setOrderError('Errore durante la creazione automatica in magazzino: ' + e.message);
    } finally {
      setAddingFromCatalog(null);
    }
  };

  const handleUpdateCartQty = (itemId: string, qty: number) => {
    setOrderError('');
    if (qty <= 0) {
      setCart(prev => prev.filter(p => p.itemId !== itemId));
    } else {
      setCart(prev => prev.map(p => p.itemId === itemId ? { ...p, quantityRequested: qty } : p));
    }
  };

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;
    try {
      if (editingOrderId) {
        await updateRestockOrder(editingOrderId, cart, selectedProperty);
        setActiveOrderId(editingOrderId);
      } else {
        const orderId = await addRestockOrder(cart, selectedProperty);
        setActiveOrderId(orderId);
      }
      setCart([]);
      setIsBuilding(false);
      setEditingOrderId(null);
      await loadData();
    } catch (e: any) {
      console.error("Order creation error:", e);
      setOrderError(e instanceof Error ? e.message : "Errore nel salvataggio dell'ordine");
    }
  };

  const activeOrder = orders.find(o => o.id === activeOrderId);

  if (loading || settingsLoading) {
     return <div className="p-8 text-center"><ShoppingCart className="animate-pulse mx-auto mb-4" size={32}/>Caricamento...</div>;
  }

  // Visualizzazione Singolo Ordine
  if (activeOrderId && activeOrder) {
    return <OrderDetailView order={activeOrder} items={items} onClose={() => {
       setActiveOrderId(null);
       const url = new URL(window.location.href);
       url.searchParams.delete('order');
       window.history.pushState({}, '', url);
       loadData();
    }} onEdit={() => {
       setIsBuilding(true);
       setCart(activeOrder.items);
       if (activeOrder.property) {
         setSelectedProperty(activeOrder.property);
       }
       setEditingOrderId(activeOrder.id);
       setActiveOrderId(null);
    }} onDelete={async () => {
       if (confirm("Sei sicuro di voler eliminare questo ordine?")) {
         await deleteRestockOrder(activeOrder.id);
         setActiveOrderId(null);
         setEditingOrderId(null);
         await loadData();
       }
    }} />;
  }

  // Creazione Nuovo Ordine
  if (isBuilding) {
    const filteredItems = filteredItemsByProperty.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const existingNames = new Set(filteredItemsByProperty.map(i => i.name.toLowerCase()));
    const filteredCatalog = catalogItems.filter(c => 
       c.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
       !existingNames.has(c.name.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => { setIsBuilding(false); setEditingOrderId(null); }} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-black text-gray-900">{editingOrderId ? "Modifica Ordine" : "Nuovo Ordine"}</h2>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-sm text-gray-500 hidden sm:block">Proprietà:</label>
            <select
              value={selectedProperty || ''}
              onChange={e => setSelectedProperty(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            >
              <option value="Tutte" disabled>Seleziona Proprietà...</option>
              {settings.properties.map(p => p !== 'Tutte' && <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
             <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="flex bg-white rounded-lg border border-gray-200">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Cerca articoli da aggiungere..."
                      className="w-full pl-10 pr-4 py-2 bg-transparent focus:ring-0 outline-none"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="border-l border-gray-200">
                    <select
                      className="h-full px-3 py-2 bg-gray-50 text-sm text-gray-700 outline-none cursor-pointer rounded-r-lg max-w-[150px]"
                      onChange={(e) => {
                         if (e.target.value) {
                           setSearchTerm(e.target.value);
                           e.target.value = "";
                         }
                      }}
                      value=""
                      title="Sfoglia l'anagrafica completa"
                    >
                      <option value="">Anagrafica...</option>
                      {catalogItems.sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
             </div>
             <div className="overflow-y-auto flex-1 p-2">
                {filteredItems.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-2 mt-2">In Magazzino</div>}
                {filteredItems.map(item => (
                   <div key={item.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group cursor-pointer" onClick={() => handleAddToCart(item)}>
                      <div>
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="text-[10px] text-gray-400">Scorta: {item.quantity}</p>
                      </div>
                      <button className="text-blue-600 bg-blue-50 rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">+</button>
                   </div>
                ))}

                {filteredCatalog.length > 0 && (
                  <>
                    <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2 ml-2 mt-4 flex items-center gap-1"><Library size={12}/> Anagrafica (Non in magazzino)</div>
                    {filteredCatalog.map(cItem => (
                       <div key={cItem.id} className="flex items-center justify-between p-2 hover:bg-blue-50 rounded-lg group cursor-pointer" onClick={() => addingFromCatalog ? null : handleAddCatalogItemToCart(cItem)}>
                          <div className={addingFromCatalog === cItem.id ? 'opacity-50' : ''}>
                            <p className="font-semibold text-sm text-blue-900">{cItem.name}</p>
                            <p className="text-[10px] text-blue-400">Aggiungerà nuovo articolo al magazzino</p>
                          </div>
                          <button disabled={!!addingFromCatalog} className="text-blue-600 bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            {addingFromCatalog === cItem.id ? <Loader2 size={16} className="animate-spin" /> : '+'}
                          </button>
                       </div>
                    ))}
                  </>
                )}
             </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex flex-col">
             <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><ShoppingCart size={18}/> Lista Selezionata</h3>
             <div className="flex-1 overflow-y-auto space-y-3">
               {cart.length === 0 ? <p className="text-gray-400 text-sm italic">Nessun articolo selezionato.</p> : cart.map((c, i) => (
                 <div key={i} className="flex flex-col gap-2 p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                   <p className="font-bold text-sm text-gray-900">{c.itemName}</p>
                   <div className="flex items-center justify-between">
                     <span className="text-xs text-gray-500">Quantità:</span>
                     <div className="flex items-center gap-3">
                       <button onClick={() => handleUpdateCartQty(c.itemId, c.quantityRequested - 1)} className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center font-black">-</button>
                       <span className="font-bold min-w-[20px] text-center">{c.quantityRequested}</span>
                       <button onClick={() => handleUpdateCartQty(c.itemId, c.quantityRequested + 1)} className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center font-black">+</button>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
             {orderError && (
               <div className="p-3 mb-2 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                 {orderError}
               </div>
             )}
             {cart.length > 0 && (
               <button onClick={handleSubmitOrder} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                 <CheckCircle2 size={18} /> {editingOrderId ? "Salva Modifiche (Aggiorna Ordine)" : "Invia Lista (Creazione Ordine)"}
               </button>
             )}
          </div>
        </div>
      </div>
    );
  }

  // Listing View
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Approvvigionamenti</h2>
          <p className="text-sm text-gray-500">Gestisci gli ordini di approvvigionamento</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
          >
            {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {canCreate && (
             <button onClick={() => setIsBuilding(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 shadow-sm">
               Ordina Prodotti
             </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
         {filteredOrdersByProperty.length === 0 && <div className="p-8 text-center text-gray-400">Nessun ordine presente per questa proprietà.</div>}
         {filteredOrdersByProperty.map(o => (
           <div key={o.id} onClick={() => setActiveOrderId(o.id)} className="bg-white border hover:border-blue-300 transition cursor-pointer border-gray-200 shadow-sm rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between group">
             <div>
               <div className="flex items-center gap-3 mb-1">
                 <span className="font-black text-lg text-gray-900">{o.orderNumber}</span>
                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider
                   ${o.status === 'pending' ? 'bg-amber-100 text-amber-800' : ''}
                   ${o.status === 'purchased' ? 'bg-blue-100 text-blue-800' : ''}
                   ${o.status === 'fulfilled' ? 'bg-emerald-100 text-emerald-800' : ''}
                 `}>
                   {o.status === 'pending' && 'Da Acquistare'}
                   {o.status === 'purchased' && 'Acquistato - Da Ritirare'}
                   {o.status === 'fulfilled' && 'Completato'}
                 </span>
               </div>
               <p className="text-xs text-gray-500">Creato il: {o.createdAt.toLocaleDateString()} da {o.requestedBy}</p>
               <p className="text-sm font-medium mt-2">{o.items.length} articoli in lista</p>
             </div>
             <div className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                Vedi Dettagli &rarr;
             </div>
           </div>
         ))}
      </div>
    </div>
  );
}

// ==========================================
// ORDER DETAIL VIEW
// ==========================================
function OrderDetailView({ order, items, onClose, onEdit, onDelete }: { order: RestockOrder, items: Item[], onClose: () => void, onEdit?: () => void, onDelete?: () => void }) {
  const { role, isAdmin } = useAuthContext();
  const canPurchase = isAdmin || role === 'acquisti';
  const canFulfill = isAdmin || role === 'magazzino';
  const canEdit = isAdmin || role === 'magazzino';
  
  const [orderItems, setOrderItems] = useState<RestockOrderItem[]>(() => 
     order.items.map(i => ({
       ...i, 
       quantityPurchased: i.quantityPurchased ?? i.quantityRequested,
       quantityDelivered: i.quantityDelivered ?? i.quantityPurchased ?? i.quantityRequested,
       unitPrice: i.unitPrice ?? items.find(xi => xi.id === i.itemId)?.price
     }))
  );
  
  const [submitting, setSubmitting] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [newDateStr, setNewDateStr] = useState(order.createdAt.toISOString().split('T')[0]);

  const handleShare = () => {
    const baseUrl = 'https://hyper-flow.vercel.app/';
    const url = new URL(baseUrl);
    url.searchParams.set('order', order.id);
    const text = `Ordine ${order.orderNumber}. Clicca per aprire nell'app:\n${url.toString()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return alert("Impossibile aprire la finestra di stampa. Controlla il blocco popup.");

    const styles = `
      <style>
        body { font-family: sans-serif; padding: 20px; color: #333; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        .meta { margin-bottom: 30px; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; text-align: left; }
        th, td { border: 1px solid #ddd; padding: 10px; }
        th { background-color: #f9f9f9; }
        .total { margin-top: 20px; font-weight: bold; text-align: right; font-size: 18px; }
        .success { color: green; }
        .warning { color: orange; }
        .danger { color: red; }
      </style>
    `;

    const htmlContent = `
      <html>
        <head>
          <title>Report Ordine ${order.orderNumber}</title>
          ${styles}
        </head>
        <body>
          <h1>${order.status === 'fulfilled' ? 'Report di Carico' : order.status === 'purchased' ? 'Ordine in Arrivo' : 'Richiesta di Ordine'} - Ordine ${order.orderNumber}</h1>
          <div class="meta">
            <strong>Stato:</strong> ${order.status === 'fulfilled' ? 'Completato' : order.status === 'purchased' ? 'Acquistato/In Arrivo' : 'In Richiesta'}<br/>
            <strong>Richiedente:</strong> ${order.requestedBy}<br/>
            <strong>Data Creazione:</strong> ${order.createdAt.toLocaleDateString()}<br/>
            ${order.purchasedAt ? `<strong>Data Acquisto:</strong> ${order.purchasedAt.toLocaleDateString()}<br/>` : ''}
            ${order.fulfilledAt ? `<strong>Data Carico:</strong> ${order.fulfilledAt.toLocaleDateString()}<br/>` : ''}
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Richiesti</th>
                <th>Acquistati</th>
                <th>Caricati in Magazzino</th>
                <th>Prezzo Cad.</th>
                <th>Totale</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${item.itemName}</td>
                  <td>${item.quantityRequested}</td>
                  <td class="${!item.isPurchased ? 'danger' : ''}">${item.isPurchased ? item.quantityPurchased : 'Non Trovato'}</td>
                  <td class="${item.quantityDelivered === item.quantityPurchased ? 'success' : 'warning'}">
                    ${item.isPurchased ? item.quantityDelivered : '0'}
                  </td>
                  <td>€ ${item.unitPrice !== undefined ? Number(item.unitPrice).toFixed(2) : '0.00'}</td>
                  <td>€ ${item.isPurchased && item.unitPrice ? (item.unitPrice * (item.quantityPurchased || 0)).toFixed(2) : '0.00'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          ${order.totalCost ? `<div class="total">Costo Totale Ordine: € ${order.totalCost.toFixed(2)}</div>` : ''}
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const handleUpdateDate = async () => {
    setSubmitting(true);
    try {
      const newD = new Date(newDateStr);
      await updateRestockOrderDate(order.id, newD);
      order.createdAt = newD; // Mutate local obj for immediate UI feedback
      setIsEditingDate(false);
    } catch(e: any) {
      alert("Errore modifica data: " + (e.message || "Errore sconosciuto"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateItemField = (index: number, field: string, value: any) => {
    setOrderItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handlePurchase = async () => {
    setSubmitting(true);
    try {
      const cleanItems = orderItems.map(item => {
        const { _unitPriceInput, ...rest } = item as any;
        const out = { ...rest };
        if (out.unitPrice === undefined) {
          out.unitPrice = 0;
        }
        out.quantityDelivered = out.quantityPurchased;
        return out as RestockOrderItem;
      });
      const totalCost = cleanItems.reduce((acc, curr) => acc + (curr.isPurchased ? ((curr.unitPrice || 0) * (curr.quantityPurchased || 0)) : 0), 0);
      await purchaseRestockOrder(order.id, cleanItems, totalCost);
      onClose();
    } catch(e: any) {
      alert("Errore salvataggio: " + (e.message || "Errore sconosciuto"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFulfill = async () => {
    setSubmitting(true);
    try {
      const cleanItems = orderItems.map(item => {
        const { _unitPriceInput, ...rest } = item as any;
        const out = { ...rest };
        if (out.unitPrice === undefined || isNaN(out.unitPrice)) {
          out.unitPrice = 0;
        }
        return out as RestockOrderItem;
      });
      await fulfillRestockOrder(order.id, cleanItems);
      onClose();
    } catch(e: any) {
      alert("Errore conferma: " + (e.message || "Errore sconosciuto"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={16} /> Indietro
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handlePrintReport} className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 px-3 rounded-lg flex items-center gap-2 text-sm font-bold transition">
            <Printer size={16} /> Stampa Report
          </button>
          <button onClick={handleShare} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 p-2 px-3 rounded-lg flex items-center gap-2 text-sm font-bold transition">
            <Share2 size={16} /> Invia a WhatsApp
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
        <div className="absolute top-6 right-6 flex gap-2">
          {order.status === 'pending' && canEdit && onEdit && (
            <button onClick={onEdit} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition" title="Modifica Ordine">
              <Edit2 size={18} />
            </button>
          )}
          {isAdmin && onDelete && (
            <button onClick={onDelete} className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Elimina Ordine">
              <Trash2 size={18} />
            </button>
          )}
        </div>
        <h2 className="text-3xl font-black text-gray-900">{order.orderNumber}</h2>
        <div className="mt-2 flex gap-2 items-center">
           <span className="text-sm text-gray-500">Creato da: <strong>{order.requestedBy}</strong></span>
           <span className="text-sm text-gray-500">•</span>
           {isEditingDate ? (
             <div className="flex gap-2 items-center">
               <input 
                 type="date" 
                 value={newDateStr} 
                 onChange={e => setNewDateStr(e.target.value)} 
                 className="text-sm px-2 py-1 border rounded-lg"
               />
               <button onClick={handleUpdateDate} disabled={submitting} className="p-1 text-green-600 hover:bg-green-50 rounded">
                 <Check size={16} />
               </button>
               <button onClick={() => setIsEditingDate(false)} disabled={submitting} className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                 <X size={16} />
               </button>
             </div>
           ) : (
             <span className="text-sm text-gray-500 flex items-center gap-2">
               {order.createdAt.toLocaleDateString()}
               {isAdmin && <button onClick={() => setIsEditingDate(true)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Modifica data"><Edit2 size={14} /></button>}
             </span>
           )}
        </div>
      </div>

      <div className="space-y-4">
        {orderItems.map((item, idx) => (
          <div key={item.itemId} className={`p-5 rounded-2xl border transition ${order.status === 'pending' && item.isPurchased ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 shadow-sm'}`}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg text-gray-900">{item.itemName}</h3>
              {order.status === 'pending' && canPurchase && (
                <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                  <input type="checkbox" checked={item.isPurchased || false} onChange={e => updateItemField(idx, 'isPurchased', e.target.checked)} className="w-5 h-5 text-green-600 rounded cursor-pointer"/>
                  <span className="text-sm font-bold text-gray-700">Trovato</span>
                </label>
              )}
            </div>

            {/* Vista per chi acquista (Giulia) e ordine in Pending */}
            {order.status === 'pending' && canPurchase && (
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Q.tà Acquistata</span>
                   <div className="flex flex-col gap-1">
                     <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 max-w-[120px]">
                       <button type="button" onClick={() => updateItemField(idx, 'quantityPurchased', Math.max(0, (item.quantityPurchased||0) - 1))} className="w-10 h-10 flex items-center justify-center font-black text-gray-500 hover:text-black">-</button>
                       <input type="number" readOnly className="w-10 text-center font-bold bg-transparent outline-none" value={item.quantityPurchased} />
                       <button type="button" onClick={() => updateItemField(idx, 'quantityPurchased', (item.quantityPurchased||0) + 1)} className="w-10 h-10 flex items-center justify-center font-black text-gray-500 hover:text-black">+</button>
                     </div>
                     <span className="text-xs text-blue-600 font-medium">Richiesti: {item.quantityRequested}</span>
                   </div>
                 </div>
                 <div>
                   <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Prezzo Singolo (€)</span>
                   <input 
                     type="text" 
                     inputMode="decimal"
                     value={
                       (item as any)._unitPriceInput !== undefined 
                         ? (item as any)._unitPriceInput 
                         : (item.unitPrice !== undefined && item.unitPrice !== 0 ? String(item.unitPrice).replace('.', ',') : '')
                     } 
                     onChange={e => {
                       let raw = e.target.value.replace(/[^0-9.,]/g, '');
                       if (raw.length > 1 && raw.startsWith('0') && raw[1] !== ',' && raw[1] !== '.') {
                         raw = raw.substring(1);
                       }
                       if (raw.startsWith(',')) raw = '0' + raw;
                       if (raw.startsWith('.')) raw = '0' + raw;
                       
                       updateItemField(idx, '_unitPriceInput', raw);
                       updateItemField(idx, 'unitPrice', raw ? parseFloat(raw.replace(',', '.')) : undefined);
                     }}
                     className="w-full text-lg font-bold border-b-2 border-gray-200 py-1 outline-none focus:border-blue-500 bg-transparent" 
                     placeholder="0,00"
                   />
                 </div>
               </div>
            )}

            {/* Vista per Marco che verifica */}
            {order.status === 'purchased' && canFulfill && (
               <div className="grid grid-cols-2 gap-4 mt-2">
                 <div>
                   <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Q.tà Effettivamente Ricevuta</span>
                   <div className="flex items-center gap-2">
                     <div className="flex flex-col gap-1 w-full">
                       <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 max-w-[120px]">
                         <button type="button" onClick={() => updateItemField(idx, 'quantityDelivered', Math.max(0, (item.quantityDelivered||0) - 1))} className="w-10 h-10 flex items-center justify-center font-black text-gray-500 hover:text-black">-</button>
                         <input type="number" readOnly className="w-10 text-center font-bold bg-transparent outline-none" value={item.quantityDelivered} />
                         <button type="button" onClick={() => updateItemField(idx, 'quantityDelivered', (item.quantityDelivered||0) + 1)} className="w-10 h-10 flex items-center justify-center font-black text-gray-500 hover:text-black">+</button>
                       </div>
                       <span className="text-xs text-blue-600 font-medium whitespace-nowrap">Richiesti: {item.quantityRequested} | Acq.: {item.quantityPurchased}</span>
                     </div>
                   </div>
                 </div>
                 <div>
                   <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Prezzo Cad. (€)</span>
                   <span className="font-bold text-lg mt-2 inline-block">€{item.unitPrice !== undefined ? Number(item.unitPrice).toFixed(2) : '0.00'}</span>
                 </div>
               </div>
            )}

            {/* Vista di solo lettura per ordini già confermati magazzino o se l'utente non ha i permessi */}
            {((order.status === 'fulfilled') || (order.status === 'purchased' && !canFulfill)) && (
               <div className="flex flex-wrap gap-6 mt-2">
                 <div>
                   <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold">Richiesti</span>
                   <span className="font-bold text-gray-900">{item.quantityRequested}</span>
                 </div>
                 <>
                   <div>
                     <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold">Acquistati</span>
                     <span className={`font-bold ${item.isPurchased ? 'text-green-600' : 'text-red-500'}`}>{item.isPurchased ? item.quantityPurchased : 'Non trovato'}</span>
                   </div>
                   {order.status === 'fulfilled' && (
                     <div>
                       <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold">Ricevuti</span>
                       <span className={`font-bold ${item.quantityDelivered === item.quantityPurchased ? 'text-green-600' : 'text-orange-500'}`}>{item.isPurchased ? item.quantityDelivered : '0'}</span>
                     </div>
                   )}
                   {item.isPurchased && (
                     <div>
                       <span className="block text-[10px] text-gray-500 uppercase tracking-wider font-bold">Prezzo Cad.</span>
                       <span className="font-bold">€{item.unitPrice !== undefined ? Number(item.unitPrice).toFixed(2) : '0.00'}</span>
                     </div>
                   )}
                 </>
               </div>
            )}

          </div>
        ))}
      </div>

      {order.status === 'pending' && canPurchase && (
         <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-2xl flex items-center justify-between lg:pl-64 z-10">
           <div>
              <p className="text-sm font-bold text-gray-500">Azione richiesta</p>
              <p className="font-black text-xl">Conferma Ordine</p>
           </div>
           <button onClick={handlePurchase} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-black text-lg disabled:opacity-50 ring-4 ring-blue-100 flex items-center gap-2">
             {submitting ? 'Salvataggio...' : 'Fatto!'} <CheckCircle2 />
           </button>
         </div>
      )}

      {order.status === 'purchased' && canFulfill && (
         <div className="fixed bottom-0 left-0 right-0 p-4 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between lg:pl-64 z-10">
           <div>
              <p className="text-sm font-bold text-emerald-800">Merce Arrivata?</p>
              <p className="font-black text-emerald-900">Verifica Quantità</p>
           </div>
           <button onClick={handleFulfill} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg disabled:opacity-50">
             <PackageOpen /> Carica a Magazzino
           </button>
         </div>
      )}
      
      {order.status === 'fulfilled' && (
         <div className="p-6 bg-gray-50 text-center rounded-xl border border-gray-200 mt-8 space-y-4">
           <div className="font-bold text-gray-500">Questo ordine è stato completato e la merce è in magazzino.</div>
           <button onClick={handlePrintReport} className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-sm mx-auto">
             <Printer size={20} /> Stampa o Salva PDF Report di Carico
           </button>
         </div>
      )}

    </div>
  );
}
