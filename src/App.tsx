import { useState, useEffect } from 'react';
import { Auth, useAuthContext } from './components/Auth';
import { SettingsProvider } from './components/SettingsProvider';
import { Inventory } from './components/Inventory';
import { History } from './components/History';
import { Housekeeping } from './components/Housekeeping';
import { Reports } from './components/Reports';
import { Operators } from './components/Operators';
import { Profile } from './components/Profile';
import { Dashboard } from './components/Dashboard';
import { CashflowManager } from './components/Cashflow';
import WorkActivities from './components/WorkActivities';
import { Orders } from './components/Orders';
import { PropertiesAdmin } from './components/PropertiesAdmin';
import { Catalog } from './components/Catalog';
import { Parking } from './components/Parking';
import { BackupAndRestore } from './components/BackupAndRestore';
import { DbProcessing } from './components/DbProcessing';
import { PackageOpen, ListOrdered, BarChart3, LogOut, Menu, X, Users, UserCircle, LayoutDashboard, Sparkles, Wallet, ShoppingCart, Building2, Library, Briefcase, Car, Settings2, ArrowUp, ArrowDown, Database, WifiOff, Activity, Droplets } from 'lucide-react';
import { HyperFlowLogo } from './components/HyperFlowLogo';
import { auth } from './firebase/config';
import { SystemLogsList } from './components/SystemLogsList';
import packageJson from '../package.json';
import { db } from './firebase/config';
import { collection, getDocs, writeBatch } from 'firebase/firestore';

function AutoFixer() {
   useEffect(() => {
      async function run() {
        const hKey = 'history-fix-v2';
        if (localStorage.getItem(hKey)) return;
        try {
           const allTxSnap = await getDocs(collection(db, 'transactions'));
           let batch = writeBatch(db);
           let count = 0;
           for (const d of allTxSnap.docs) {
             const data = d.data();
             if (!data.notes || data.notes.trim() === '') {
                let newNotes = '';
                if (data.type === 'in') {
                    newNotes = `Carico in magazzino ${data.property || ''}`.trim();
                } else if (data.type === 'out') {
                    newNotes = `Scarico verso ${data.apartment || 'destinazione'}`;
                }
                if (newNotes) {
                   batch.update(d.ref, { notes: newNotes });
                   count++;
                }
             }
             if (count >= 490) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
             }
           }
           if (count > 0) { await batch.commit(); }
           localStorage.setItem(hKey, 'true');
           console.log("Auto-fix movimenti storici eseguito con successo");
        } catch (e) {
           console.error("Errore auto-fix", e);
        }
      }
      run();
   }, []);
   return null;
}

declare const __BUILD_TIME__: string;

type View = 'dashboard' | 'inventory' | 'history' | 'cashflow' | 'works' | 'reports' | 'operators' | 'profile' | 'orders' | 'properties' | 'catalog' | 'orders_esauriti' | 'orders_sottoscorta' | 'parking' | 'backup' | 'systemlogs' | 'dbprocessing';

function MainApp() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsSyncing(true);
      window.dispatchEvent(new Event('app-network-online'));
      setTimeout(() => setIsSyncing(false), 3000);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Ripristina connessione Firestore quando l'app torna in primo piano (risolve blocchi "loading" su iOS)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        try {
          const { disableNetwork, enableNetwork } = await import('firebase/firestore');
          const { db } = await import('./firebase/config');
          await disableNetwork(db);
          await enableNetwork(db);
        } catch (e) {
          console.error("Errore nel reset della rete Firebase:", e);
        }
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const [view, setView] = useState<View>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const validViews = ['dashboard', 'inventory', 'history', 'cashflow', 'works', 'reports', 'operators', 'profile', 'orders', 'properties', 'catalog', 'orders_esauriti', 'orders_sottoscorta', 'parking', 'backup', 'dbprocessing'];
    
    if (viewParam && validViews.includes(viewParam)) {
      return viewParam as View;
    }
    if (params.get('order')) {
      return 'orders';
    }
    return 'dashboard';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAdmin, hideFinancials, permissions } = useAuthContext();
  
  const p = permissions || {};
  const can = (key: string) => isAdmin || p[key];

  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [menuOrder, setMenuOrder] = useState<string[]>([]);
  const [modalMenuOrder, setModalMenuOrder] = useState<string[]>([]);

  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, req: can('dashboard') },
    { id: 'housekeeping', label: 'Housekeeping', icon: <Sparkles size={20} />, req: can('inventory') },
    { id: 'inventory', label: 'Scorte', icon: <PackageOpen size={20} />, req: can('inventory') },
    { id: 'catalog', label: 'Anagrafica Articoli', icon: <Library size={20} />, req: can('inventory') },
    { id: 'orders', label: 'Ordini', icon: <ShoppingCart size={20} />, req: can('orders') },
    { id: 'history', label: 'Movimenti', icon: <ListOrdered size={20} />, req: can('history') },
    { id: 'cashflow', label: 'Finanze', icon: <Wallet size={20} />, req: can('cashflow') && !hideFinancials },
    { id: 'parking', label: 'Parcheggio', icon: <Car size={20} />, req: can('parking') },
    { id: 'works', label: 'Competenze e Servizi', icon: <Briefcase size={20} />, req: can('works') },
    { id: 'reports', label: 'Stock Report', icon: <BarChart3 size={20} />, req: can('reports') && !hideFinancials },
    { id: 'properties', label: 'Gestione Proprietà', icon: <Building2 size={20} />, req: can('properties') },
    { id: 'operators', label: 'Operatori', icon: <Users size={20} />, req: isAdmin },
    { id: 'dbprocessing', label: 'Elaborazione Dati DB', icon: <Database size={20} />, req: isAdmin },
    { id: 'systemlogs', label: 'Log di Sistema (Novità)', icon: <Activity size={20} />, req: isAdmin },
    { id: 'backup', label: 'Backup e Ripristino', icon: <Database size={20} />, req: isAdmin }
  ];

  const availableItemIdsStr = JSON.stringify(allMenuItems.filter(i => i.req).map(i => i.id));

  useEffect(() => {
    if (user) {
      const availableItemIds = JSON.parse(availableItemIdsStr);
      const saved = localStorage.getItem('sidebar-order-' + user.uid);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const valid = parsed.filter((id: string) => availableItemIds.includes(id));
          const missing = availableItemIds.filter((id: string) => !valid.includes(id));
          setMenuOrder([...valid, ...missing]);
        } catch {
          setMenuOrder(availableItemIds);
        }
      } else {
        setMenuOrder(availableItemIds);
      }
    }
  }, [user, availableItemIdsStr]);

  const openMenuModal = () => {
    setModalMenuOrder([...menuOrder]);
    setIsMenuModalOpen(true);
  };

  const saveMenuOrder = () => {
    setMenuOrder(modalMenuOrder);
    if (user) {
      localStorage.setItem('sidebar-order-' + user.uid, JSON.stringify(modalMenuOrder));
    }
    setIsMenuModalOpen(false);
  };

  const moveMenuWidget = (id: string, direction: 'up' | 'down') => {
    const idx = modalMenuOrder.indexOf(id);
    if (idx === -1) return;
    const newWidgets = [...modalMenuOrder];
    if (direction === 'up' && idx > 0) {
      [newWidgets[idx - 1], newWidgets[idx]] = [newWidgets[idx], newWidgets[idx - 1]];
    } else if (direction === 'down' && idx < newWidgets.length - 1) {
      [newWidgets[idx + 1], newWidgets[idx]] = [newWidgets[idx], newWidgets[idx + 1]];
    }
    setModalMenuOrder(newWidgets);
  };

  useEffect(() => {
    // Gestione vecchi URL se necessario, ma lo init è già fatto sopra
  }, []);

  const NavContent = () => (
    <>
      <nav className="flex-1 space-y-1.5 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
        {menuOrder.map(id => {
           const item = allMenuItems.find(i => i.id === id);
           if (!item || !item.req) return null;
           return (
             <button
               key={item.id}
               onClick={() => { setView(item.id as View); setIsMobileMenuOpen(false); }}
               className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-xl transition ${
                 (view === item.id || (item.id === 'orders' && view.startsWith('orders'))) ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
               }`}
             >
               {item.icon}
               {item.label}
             </button>
           );
        })}
      </nav>

      <div className="p-4 border-t border-gray-100 shrink-0 bg-white">
        <button
          onClick={openMenuModal}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-xl transition text-gray-600 hover:bg-gray-50 mb-2"
        >
          <Settings2 size={20} />
          Ordina Menu
        </button>
        <button
          onClick={() => { setView('profile'); setIsMobileMenuOpen(false); }}
          className="flex items-center justify-between w-full hover:bg-gray-50 p-2 rounded-xl transition text-left"
        >
          <div className="overflow-hidden flex items-center gap-2">
            <UserCircle size={20} className="text-gray-400 shrink-0"/>
            <div className="truncate">
              <p className="text-sm font-medium text-gray-900 truncate">{auth.currentUser?.displayName || 'Utente Profilo'}</p>
              <p className="text-xs text-gray-500 truncate">{auth.currentUser?.email}</p>
            </div>
          </div>
        </button>
        <button
            onClick={() => auth.signOut()}
            className="mt-2 w-full flex items-center justify-center gap-2 p-2 text-red-600 hover:bg-red-50 font-medium text-sm rounded-lg transition"
          >
            <LogOut size={16} /> Esci
        </button>
        <div className="mt-3 text-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
          Release v{packageJson.version}
          <div className="text-[9px] font-medium normal-case tracking-normal mt-0.5 text-gray-400/80">
            {new Date(__BUILD_TIME__).toLocaleString('it-IT', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AutoFixer />
      {/* Network Status Indicator */}
      <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-2 rounded-full shadow-lg border border-gray-100 text-xs font-bold text-gray-700 pointer-events-none transition-all duration-300">
        <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? (isSyncing ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]') : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
        {isOnline ? (isSyncing ? 'Sincronizzazione...' : 'Online') : 'Offline'}
      </div>
      
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 fixed inset-y-0 z-40">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <HyperFlowLogo size={36} />
          <div className="flex flex-col">
            <h1 className="font-bold tracking-tight text-gray-900 leading-none">HyperFlow</h1>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1">Hospitality Suite</span>
          </div>
        </div>
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50 flex items-center justify-between px-4">
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className="flex items-center justify-end gap-3">
           <div className="flex flex-col text-right">
             <h1 className="font-bold tracking-tight text-gray-900 leading-none">HyperFlow</h1>
             <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mt-0.5">Hospitality Suite</span>
           </div>
           <HyperFlowLogo size={32} />
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/20 pt-16" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="bg-white h-full shadow-xl flex flex-col w-64" onClick={e => e.stopPropagation()}>
            <NavContent />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 min-w-0 lg:pl-64 pt-16 lg:pt-0">
        {!isOnline && (
          <div className="bg-amber-100/80 border-b border-amber-200 px-4 py-2.5 flex items-center justify-center gap-2 text-amber-800 text-sm font-medium z-30 relative">
            <WifiOff size={16} />
            <span>Sei offline - lavoro in assenza di rete. Le modifiche verranno salvate appena torna la connessione.</span>
          </div>
        )}
        <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-24 lg:pb-8">
          {view === 'dashboard' && can('dashboard') && <Dashboard onNavigate={setView} />}
          {view === 'housekeeping' && can('inventory') && <Housekeeping />}
          {view === 'inventory' && can('inventory') && <Inventory />}
          {view === 'catalog' && can('inventory') && <Catalog />}
          {view === 'orders' && can('orders') && <Orders />}
          {view === 'orders_esauriti' && can('orders') && <Orders autoFill="esauriti" />}
          {view === 'orders_sottoscorta' && can('orders') && <Orders autoFill="sottoscorta" />}
          {view === 'history' && can('history') && <History />}
          {view === 'cashflow' && !hideFinancials && can('cashflow') && <CashflowManager />}
          {view === 'works' && can('works') && <WorkActivities />}
          {view === 'parking' && can('parking') && <Parking />}
          {view === 'reports' && !hideFinancials && can('reports') && <Reports />}
          {view === 'operators' && isAdmin && <Operators />}
          {view === 'backup' && isAdmin && <BackupAndRestore />}
          {view === 'dbprocessing' && isAdmin && <DbProcessing />}
          {view === 'systemlogs' && isAdmin && <SystemLogsList />}
          {view === 'properties' && can('properties') && <PropertiesAdmin />}
          {view === 'profile' && <Profile />}
        </div>
      </main>

      {/* Modal Ordina Menu */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <Settings2 className="text-blue-600" size={24} />
                Ordina Menu Principale
              </h2>
              <button 
                onClick={() => setIsMenuModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-6 space-y-3 overflow-y-auto">
               <p className="text-sm text-gray-500 mb-4 block">Personalizza l'ordine delle voci del menu della barra laterale utilizzando le frecce su e giù.</p>
               {modalMenuOrder.map(id => {
                 const widget = allMenuItems.find(w => w.id === id);
                 if (!widget || !widget.req) return null;
                 return (
                   <div 
                     key={widget.id} 
                     className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-white shadow-sm"
                   >
                     <div className="flex items-center gap-3 flex-1 cursor-default">
                       <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
                          {widget.icon}
                       </div>
                       <span className="font-bold flex-1 text-gray-700">{widget.label}</span>
                     </div>
                     <div className="flex flex-col gap-1 border-l border-gray-100 pl-3">
                       <button type="button" onClick={() => moveMenuWidget(widget.id, 'up')} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition cursor-pointer"><ArrowUp size={16} /></button>
                       <button type="button" onClick={() => moveMenuWidget(widget.id, 'down')} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition cursor-pointer"><ArrowDown size={16} /></button>
                     </div>
                   </div>
                 );
               })}
            </div>
            <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 px-6 pb-6">
              <button 
                onClick={saveMenuOrder}
                className="w-full px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center shadow-sm cursor-pointer"
              >
                Salva Ordine Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { DebugConsole } from './components/DebugConsole';

export default function App() {
  return (
    <Auth>
      <SettingsProvider>
        <MainApp />
        <DebugConsole />
      </SettingsProvider>
    </Auth>
  );
}
