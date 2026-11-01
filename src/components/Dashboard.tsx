import React, { useState, useEffect, useMemo } from 'react';
import { Item, Transaction, RestockOrder, Cashflow, ParkingReservation, WorkActivity } from '../types';
import { getItems, getTransactions, getRestockOrders, getCashflows, getParkingReservations, getWorkActivities } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { PackageOpen, AlertTriangle, TrendingDown, ShoppingCart, CheckCircle2, RefreshCw, ArrowUpRight, ArrowDownRight, Search, List, ChevronRight, BarChart3, TrendingUp, Layers, CalendarDays, Wallet, Car, Briefcase, Settings2, X, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuthContext } from './Auth';
import { format, isToday, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, addDays } from 'date-fns';
import { it } from 'date-fns/locale';

interface DashboardProps {
  onNavigate?: (view: 'dashboard' | 'inventory' | 'history' | 'cashflow' | 'reports' | 'operators' | 'profile' | 'orders' | 'properties' | 'catalog' | 'orders_esauriti' | 'orders_sottoscorta' | 'parking' | 'works') => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { settings, loading: settingsLoading } = useSettings();
  const { user, isAdmin, permissions, hideFinancials } = useAuthContext();
  
  const can = (key: string) => isAdmin || (permissions || {})[key];

  // States
  const [items, setItems] = useState<Item[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [parking, setParking] = useState<ParkingReservation[]>([]);
  const [works, setWorks] = useState<WorkActivity[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState('');
  
  // Widget Customization
  const defaultWidgets = [
    can('inventory') && 'inventory-summary',
    can('inventory') && 'inventory-alerts-out',
    can('inventory') && 'inventory-alerts-low',
    can('cashflow') && !hideFinancials && 'cashflow-summary',
    can('orders') && 'orders-pending',
    can('history') && 'recent-tx',
    can('parking') && 'parking-today',
    can('works') && 'works-summary'
  ].filter(Boolean) as string[];

  // ..

  const allAvailableWidgets = [
    { id: 'inventory-summary', label: 'Riepilogo Magazzino', icon: <PackageOpen size={18} />, req: can('inventory') },
    { id: 'inventory-alerts-out', label: 'Allarmi Esauriti', icon: <AlertTriangle size={18} />, req: can('inventory') },
    { id: 'inventory-alerts-low', label: 'Allarmi Sottoscorta', icon: <AlertTriangle size={18} />, req: can('inventory') },
    { id: 'cashflow-summary', label: 'Saldo Cassa', icon: <Wallet size={18} />, req: can('cashflow') && !hideFinancials },
    { id: 'orders-pending', label: 'Ordini in Sospeso', icon: <ShoppingCart size={18} />, req: can('orders') },
    { id: 'recent-tx', label: 'Ultimi Movimenti', icon: <RefreshCw size={18} />, req: can('history') },
    { id: 'parking-today', label: 'Parcheggi Attivi', icon: <Car size={18} />, req: can('parking') },
    { id: 'works-summary', label: 'Competenze del Mese', icon: <Briefcase size={18} />, req: can('works') },
  ].filter(w => w.req);

  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
  const [modalWidgets, setModalWidgets] = useState<string[]>([]);
  const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem('dashboard-widgets-' + user.uid);
      if (saved) {
        try {
           const parsed = JSON.parse(saved);
           // clean up against disabled permissions
           const valid = parsed.filter((w: string) => defaultWidgets.includes(w));
           setActiveWidgets(valid.length > 0 ? valid : defaultWidgets);
           setModalWidgets(valid.length > 0 ? valid : defaultWidgets);
        } catch {
           setActiveWidgets(defaultWidgets);
           setModalWidgets(defaultWidgets);
        }
      } else {
        setActiveWidgets(defaultWidgets);
        setModalWidgets(defaultWidgets);
      }
    }
  }, [user, isAdmin, permissions]); // re-run if permissions change

  const openModal = () => {
    setModalWidgets([...activeWidgets]);
    setIsWidgetModalOpen(true);
  };

  const saveWidgets = () => {
    setActiveWidgets(modalWidgets);
    if(user) localStorage.setItem('dashboard-widgets-' + user.uid, JSON.stringify(modalWidgets));
    setIsWidgetModalOpen(false);
  };

  const moveWidget = (id: string, direction: 'up' | 'down') => {
    const idx = modalWidgets.indexOf(id);
    if (idx === -1) return;
    const newWidgets = [...modalWidgets];
    if (direction === 'up' && idx > 0) {
      [newWidgets[idx - 1], newWidgets[idx]] = [newWidgets[idx], newWidgets[idx - 1]];
    } else if (direction === 'down' && idx < newWidgets.length - 1) {
      [newWidgets[idx + 1], newWidgets[idx]] = [newWidgets[idx], newWidgets[idx + 1]];
    }
    setModalWidgets(newWidgets);
  };

  const toggleWidget = (id: string) => {
    if (modalWidgets.includes(id)) {
      setModalWidgets(prev => prev.filter(w => w !== id));
    } else {
      setModalWidgets(prev => [...prev, id]);
    }
  };

  useEffect(() => {
    if (settings.properties.length > 0 && !selectedProperty) {
      setSelectedProperty(settings.properties[0]);
    }
  }, [settings.properties, selectedProperty]);

  const loadData = async () => {
    try {
      const pItems = can('inventory') ? getItems() : Promise.resolve([]);
      const pTx = can('history') ? getTransactions() : Promise.resolve([]);
      const pOrders = can('orders') ? getRestockOrders() : Promise.resolve([]);
      const pCash = can('cashflow') && !hideFinancials ? getCashflows() : Promise.resolve([]);
      const pPark = can('parking') ? getParkingReservations() : Promise.resolve([]);
      const pWorks = can('works') ? getWorkActivities() : Promise.resolve([]);

      pItems.then(setItems).catch(console.error);
      pTx.then(setAllTransactions).catch(console.error);
      pOrders.then(setOrders).catch(console.error);
      pCash.then(setCashflows).catch(console.error);
      pPark.then(setParking).catch(console.error);
      pWorks.then(setWorks).catch(console.error);

      await Promise.allSettled([pItems, pTx, pOrders, pCash, pPark, pWorks]);
      
    } catch (e) {
      console.error(e);
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

  const {
    filteredItems,
    filteredOrders,
    recentTransactions,
    totalItems,
    totalValue,
    lowStockItems,
    outOfStockItems,
    pendingOrders,
    cashflowSummary,
    todayParking,
    monthWorks
  } = useMemo(() => {
    const prop = selectedProperty || settings.properties[0];
    
    // Inventory
    const fItems = items.filter(i => (i.property || settings.properties[0]) === prop);
    const tItems = fItems.reduce((acc, item) => acc + item.quantity, 0);
    const tValue = fItems.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0);
    const lowStock = fItems.filter(i => i.minQuantity !== undefined && i.quantity > 0 && i.quantity <= i.minQuantity);
    const outStock = fItems.filter(i => i.quantity === 0);

    // Orders
    const fOrders = orders.filter(o => (o.property || settings.properties[0]) === prop);
    const pendingOrd = fOrders.filter(r => r.status === 'pending');

    // Transactions
    const fTx = allTransactions.filter(tx => (tx.property || settings.properties[0]) === prop);
    const recTx = fTx.slice(0, 5);

    // Cashflow
    const cSum = cashflows.reduce((acc, c) => acc + (c.type === 'income' ? c.amount : -c.amount), 0);

    // Parking
    const today = startOfDay(new Date());
    const tomorrow = startOfDay(addDays(today, 1));
    const endOfTomorrow = endOfDay(tomorrow);
    
    let arrivals = 0;
    let departures = 0;
    let inProgress = 0;

    parking.forEach(p => {
      if (!p.startDate || !p.endDate) return;
      const s = startOfDay(new Date(p.startDate));
      const e = startOfDay(new Date(p.endDate));
      
      if (s.getTime() === today.getTime()) arrivals++;
      if (e.getTime() === today.getTime()) departures++;
      if (s < today && e > today) inProgress++;
    });

    const activeParkings = arrivals + departures + inProgress;
    
    const pToday = {
      total: activeParkings,
      arrivals,
      departures,
      inProgress
    };

    // Works
    let mWorks = works;
    if (prop) {
      mWorks = works.filter(w => !w.property || w.property === prop);
    }
    const now = new Date();
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);
    const currentMonthWorks = mWorks.filter(w => isWithinInterval(new Date(w.date), { start: mStart, end: mEnd }));
    const totalEarnings = currentMonthWorks.reduce((acc, w) => acc + w.amount, 0);

    return {
      filteredItems: fItems,
      filteredOrders: fOrders,
      recentTransactions: recTx,
      totalItems: tItems,
      totalValue: tValue,
      lowStockItems: lowStock,
      outOfStockItems: outStock,
      pendingOrders: pendingOrd,
      cashflowSummary: cSum,
      todayParking: pToday,
      monthWorks: { ts: currentMonthWorks.length, earnings: totalEarnings }
    };
  }, [items, allTransactions, orders, cashflows, parking, works, selectedProperty, settings.properties]);

  if (loading || settingsLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500">La tua panoramica personalizzata sulle operazioni</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {can('inventory') && (
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            >
              {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <button
            onClick={openModal}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 bg-white border border-gray-200 rounded-xl transition shadow-sm"
            title="Personalizza Dashboard"
          >
            <Settings2 size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {activeWidgets.map(widgetId => {
          if (widgetId === 'inventory-summary' && can('inventory')) {
            return (
               <div key={widgetId} onClick={() => onNavigate?.('inventory')} className="aspect-square cursor-pointer hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br from-blue-50 to-white p-4 sm:p-5 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all">
                 <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-100/50 rounded-full blur-2xl group-hover:bg-blue-200 transition"></div>
                 <div className="flex items-center gap-2 text-blue-700 z-10">
                   <div className="p-2 bg-blue-100 rounded-xl"><PackageOpen size={20} /></div>
                   <span className="font-bold text-xs sm:text-sm uppercase tracking-wider leading-tight">Scorte<br/>Totali</span>
                 </div>
                 <div className="z-10 mt-auto">
                   <span className="text-3xl sm:text-4xl font-black text-gray-900 block">{totalItems}</span>
                   {!hideFinancials && (
                     <span className="text-xs text-gray-500 font-medium block mt-1">Valore: €{totalValue.toFixed(0)}</span>
                   )}
                 </div>
               </div>
            );
          }
          if (widgetId === 'cashflow-summary' && can('cashflow') && !hideFinancials) {
            return (
               <div key={widgetId} onClick={() => onNavigate?.('cashflow')} className="aspect-square cursor-pointer hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br from-emerald-50 to-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all">
                 <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-100/50 rounded-full blur-2xl group-hover:bg-emerald-200 transition"></div>
                 <div className="flex items-center gap-2 text-emerald-700 z-10">
                   <div className="p-2 bg-emerald-100 rounded-xl"><Wallet size={20} /></div>
                   <span className="font-bold text-xs sm:text-sm uppercase tracking-wider leading-tight">Cassa<br/>Netta</span>
                 </div>
                 <div className="z-10 mt-auto">
                   <span className="text-2xl sm:text-3xl font-black text-gray-900 block">€{cashflowSummary.toFixed(1)}</span>
                   <span className="text-xs text-gray-500 font-medium block mt-1">Saldo disponibile</span>
                 </div>
               </div>
            );
          }
          if (widgetId === 'inventory-alerts-out' && can('inventory')) {
            return (
              <div key={widgetId} onClick={() => onNavigate?.('orders_esauriti')} className={`aspect-square cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br p-4 sm:p-5 rounded-2xl border flex flex-col justify-between relative overflow-hidden group ${outOfStockItems.length > 0 ? 'from-red-50 to-white border-red-200 shadow-sm' : 'from-gray-50 to-white border-gray-100 shadow-sm'}`}>
                <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl transition ${outOfStockItems.length > 0 ? 'bg-red-200/50 group-hover:bg-red-200' : 'bg-gray-200/50'}`}></div>
                <div className={`flex items-center gap-2 z-10 ${outOfStockItems.length > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                  <div className={`p-2 rounded-xl ${outOfStockItems.length > 0 ? 'bg-red-100' : 'bg-gray-100'}`}><AlertTriangle size={20} /></div>
                  <span className="font-bold text-xs sm:text-sm uppercase tracking-wider leading-tight">Esauriti</span>
                </div>
                <div className="z-10 mt-auto">
                  <span className="text-3xl sm:text-4xl font-black text-gray-900 block">{outOfStockItems.length}</span>
                  <span className="text-xs text-gray-500 font-medium block mt-1">Prodotti a Q.tà 0</span>
                </div>
              </div>
            );
          }
          if (widgetId === 'inventory-alerts-low' && can('inventory')) {
             return (
              <div key={widgetId} onClick={() => onNavigate?.('orders_sottoscorta')} className={`aspect-square cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br p-4 sm:p-5 rounded-2xl border flex flex-col justify-between relative overflow-hidden group ${lowStockItems.length > 0 ? 'from-amber-50 to-white border-amber-200 shadow-sm' : 'from-gray-50 to-white border-gray-100 shadow-sm'}`}>
                <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl transition ${lowStockItems.length > 0 ? 'bg-amber-200/50 group-hover:bg-amber-200' : 'bg-gray-200/50'}`}></div>
                <div className={`flex items-center gap-2 z-10 ${lowStockItems.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                  <div className={`p-2 rounded-xl ${lowStockItems.length > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}><AlertTriangle size={20} /></div>
                  <span className="font-bold text-xs sm:text-sm uppercase tracking-wider leading-tight">Sottoscorta</span>
                </div>
                <div className="z-10 mt-auto">
                  <span className="text-3xl sm:text-4xl font-black text-gray-900 block">{lowStockItems.length}</span>
                  <span className="text-xs text-gray-500 font-medium block mt-1">Sotto soglia</span>
                </div>
              </div>
             );
          }
          if (widgetId === 'parking-today' && can('parking')) {
            return (
               <div key={widgetId} onClick={() => onNavigate?.('parking')} className="aspect-square cursor-pointer hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br from-indigo-50 to-white p-4 sm:p-5 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all">
                 <div className="absolute -right-4 -top-4 w-20 h-20 bg-indigo-100/50 rounded-full blur-2xl group-hover:bg-indigo-200 transition"></div>
                 <div className="flex items-center gap-2 text-indigo-700 z-10 hover:text-indigo-800">
                   <div className="p-2 bg-indigo-100 rounded-xl"><Car size={20} /></div>
                   <span className="font-bold text-xs sm:text-sm uppercase tracking-wider leading-tight">Parcheggi<br/>Attivi Oggi</span>
                 </div>
                 <div className="z-10 mt-auto flex flex-col gap-1">
                   <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-black text-gray-900 leading-none">{todayParking.total}</span>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">In Totale</span>
                   </div>
                   <div className="flex items-center gap-2 text-[10px] sm:text-xs font-semibold text-gray-600 mt-1">
                     <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span> {todayParking.arrivals} In</span>
                     <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 block"></span> {todayParking.departures} Out</span>
                     <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 block"></span> {todayParking.inProgress} Sosta</span>
                   </div>
                 </div>
               </div>
            );
          }
          if (widgetId === 'works-summary' && can('works')) {
            return (
               <div key={widgetId} onClick={() => onNavigate?.('works')} className="aspect-square cursor-pointer hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br from-fuchsia-50 to-white p-4 sm:p-5 rounded-2xl border border-fuchsia-100 shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all">
                 <div className="absolute -right-4 -top-4 w-20 h-20 bg-fuchsia-100/50 rounded-full blur-2xl group-hover:bg-fuchsia-200 transition"></div>
                 <div className="flex items-center gap-2 text-fuchsia-700 z-10">
                   <div className="p-2 bg-fuchsia-100 rounded-xl"><Briefcase size={20} /></div>
                   <span className="font-bold text-xs sm:text-sm uppercase tracking-wider leading-tight">Attività<br/>Mese</span>
                 </div>
                 <div className="z-10 mt-auto">
                   {!hideFinancials ? (
                     <>
                       <span className="text-2xl sm:text-3xl font-black text-gray-900 block">€{monthWorks.earnings.toFixed(1)}</span>
                       <span className="text-xs text-gray-500 font-medium block mt-1">{monthWorks.ts} op. svolte</span>
                     </>
                   ) : (
                     <>
                       <span className="text-3xl sm:text-4xl font-black text-gray-900 block">{monthWorks.ts}</span>
                       <span className="text-xs text-gray-500 font-medium block mt-1">Op. svolte</span>
                     </>
                   )}
                 </div>
               </div>
            );
          }
          return null;
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        {/* WIDGET: PENDING ORDERS */}
        {activeWidgets.includes('orders-pending') && can('orders') && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col h-[350px]">
            <div className="p-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <ShoppingCart size={18} className="text-emerald-500" />
                Da Riassortire (Ordini)
              </h3>
              <button
                onClick={() => onNavigate?.('orders')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center"
              >
                Vedi Ordini <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
              {pendingOrders.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-gray-400">
                   <CheckCircle2 size={32} className="mb-2 text-emerald-400 opacity-50" />
                   <p className="text-sm font-medium">Nessun ordine in sospeso</p>
                 </div>
              ) : (
                 <>
                   {pendingOrders.map(o => (
                     <div 
                       key={o.id} 
                       onClick={() => {
                          const url = new URL(window.location.href);
                          url.searchParams.set('order', o.id);
                          window.history.pushState({}, '', url);
                          onNavigate?.('orders');
                       }}
                       className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                     >
                       <div className="truncate pr-4">
                         <div className="flex items-center gap-2 mb-1">
                           <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">In Transito</span>
                         </div>
                         <p className="text-sm font-semibold text-gray-900 truncate">Ordine: {o.orderNumber}</p>
                         <p className="text-xs text-gray-500 mt-0.5">Creato il {format(new Date(o.createdAt), 'dd MMM yyyy', { locale: it })}</p>
                       </div>
                     </div>
                   ))}
                 </>
              )}
            </div>
          </div>
        )}

        {/* WIDGET: RECENT TRANSACTIONS */}
        {activeWidgets.includes('recent-tx') && can('history') && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col h-[350px]">
            <div className="p-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <RefreshCw size={18} className="text-blue-500" />
                Ultimi Movimenti Magazzino
              </h3>
              <button
                onClick={() => onNavigate?.('history')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center"
              >
                Storico Completo <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
              {recentTransactions.length === 0 ? (
                <p className="text-gray-400 text-sm text-center mt-10">Nessun movimento recente</p>
              ) : (
                recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-2 rounded-lg shrink-0 ${tx.type === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {tx.type === 'in' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-gray-900 truncate">{tx.itemName}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{format(new Date(tx.date), 'dd MMM yyyy', { locale: it })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-bold text-sm ${tx.type === 'in' ? 'text-blue-600' : 'text-orange-600'}`}>
                        {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL GESTIONE WIDGET */}
      {isWidgetModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <Settings2 className="text-blue-600" size={24} />
                Widget Dashboard
              </h2>
              <button 
                onClick={() => setIsWidgetModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-6 space-y-3 overflow-y-auto">
               <p className="text-sm text-gray-500 mb-4 block">Seleziona le informazioni che desideri visualizzare nella pagina principale e modificale con le frecce. L'elenco mostra solo i moduli a te abilitati.</p>
               {(() => {
                 const inactiveWidgets = allAvailableWidgets.filter(w => !modalWidgets.includes(w.id));
                 const activeList = modalWidgets.map(id => allAvailableWidgets.find(w => w.id === id)).filter(Boolean) as typeof allAvailableWidgets;
                 
                 return [...activeList, ...inactiveWidgets].map(widget => {
                   const isActive = modalWidgets.includes(widget.id);
                   return (
                     <div 
                       key={widget.id} 
                       className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${isActive ? 'border-blue-600 bg-blue-50/50' : 'border-gray-100 bg-white'}`}
                     >
                       <div 
                         onClick={() => toggleWidget(widget.id)}
                         className="flex items-center gap-3 flex-1 cursor-pointer"
                       >
                         <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {widget.icon}
                         </div>
                         <span className={`font-bold flex-1 ${isActive ? 'text-blue-900' : 'text-gray-700'}`}>{widget.label}</span>
                         <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-2 ${isActive ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                            {isActive && <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                         </div>
                       </div>
                       {isActive && (
                         <div className="flex flex-col gap-1 border-l border-blue-200 pl-3">
                           <button type="button" onClick={() => moveWidget(widget.id, 'up')} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition"><ArrowUp size={16} /></button>
                           <button type="button" onClick={() => moveWidget(widget.id, 'down')} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition"><ArrowDown size={16} /></button>
                         </div>
                       )}
                     </div>
                   );
                 });
               })()}
            </div>
            <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50/50 px-6 pb-6 p-6">
              <button 
                onClick={saveWidgets}
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition shadow-sm"
              >
                Salva Dashboard Personalizzata
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;
