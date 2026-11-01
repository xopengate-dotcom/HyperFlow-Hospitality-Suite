import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { executeRead } from '../firebase/api';
import { useAuthContext } from './Auth';
import { Activity, AlertTriangle, ShieldAlert, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '../utils/logger';

export function SystemLogsList() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const { isAdmin } = useAuthContext();

  useEffect(() => {
    if (!isAdmin) return;
    loadLogs();
  }, [isAdmin]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'systemLogs');
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
      const s = await executeRead(getDocs(q), 15000, 'system_logs');
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(data);
      setError('');
    } catch (e: any) {
      console.error('SystemLogsList load error:', e);
      setError(e.message || 'Errore nel caricamento dei log di sistema');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) return <div className="p-6 text-red-600">Accesso negato</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
           <Activity className="text-blue-600" size={28} />
           Log di Sistema
        </h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => logger.downloadLogs()} className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-100 font-medium shadow-sm transition flex gap-2 items-center text-sm sm:text-base whitespace-nowrap">
              <Download size={18} /> Cache DBG
          </button>
          <button onClick={loadLogs} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-medium shadow-sm transition flex gap-2 items-center text-sm sm:text-base">
              Aggiorna
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" size={20} />
          <div>{error}</div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Caricamento log...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
             Nessun log trovato. Il sistema sta funzionando correttamente.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:hidden p-4 bg-gray-50/30">
               {logs.map((log) => (
                  <div key={log.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
                     <div className="flex justify-between items-start gap-4">
                        <span className="text-xs font-bold text-gray-500">{log.timestamp ? format(log.timestamp.toDate(), 'dd/MM/yyyy HH:mm') : 'N/A'}</span>
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md font-mono text-[10px] font-medium break-all text-right">{log.context}</span>
                     </div>
                     <div className="text-sm text-red-600 font-medium break-words">
                        {log.message}
                     </div>
                     <div className="pt-3 border-t border-gray-50 flex justify-end">
                        <button onClick={() => setSelectedLog(log)} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition uppercase tracking-wider w-full text-center">
                           Vedi Dettagli
                        </button>
                     </div>
                  </div>
               ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                       <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Timestamp</th>
                       <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contesto</th>
                       <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-1/2">Messaggio</th>
                       <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Dettagli</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                     {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50/50 transition border-b border-gray-50 last:border-0">
                          <td className="p-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                             {log.timestamp ? format(log.timestamp.toDate(), 'dd/MM/yyyy HH:mm:ss') : 'N/A'}
                          </td>
                          <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                             <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-mono text-xs font-medium">
                                {log.context}
                             </span>
                          </td>
                          <td className="p-4 text-sm text-red-600 font-medium truncate max-w-sm">
                             {log.message}
                          </td>
                          <td className="p-4 text-center">
                             <button onClick={() => setSelectedLog(log)} className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-lg transition text-xs font-semibold uppercase tracking-wider" title="Guarda dettagli">
                                Vedi
                             </button>
                          </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          </>
        )}
      </div>

       {selectedLog && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <ShieldAlert className="text-red-500" size={24} />
                Dettagli Log di Sistema
              </h3>
              <button onClick={() => setSelectedLog(null)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="px-6 py-6 space-y-5 overflow-y-auto">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Timestamp</div>
                     <div className="font-semibold">{selectedLog.timestamp ? format(selectedLog.timestamp.toDate(), 'dd/MM/yyyy HH:mm:ss') : 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Utente</div>
                     <div className="font-semibold break-all text-sm">{selectedLog.user}</div>
                  </div>
               </div>

               <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Contesto</div>
                  <div className="text-gray-900 font-mono text-sm bg-gray-100 px-3 py-2 rounded-lg break-all inline-block border border-gray-200">
                     {selectedLog.context}
                  </div>
               </div>

               <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Messaggio</div>
                  <div className="text-red-600 font-medium bg-red-50 px-4 py-3 rounded-xl border border-red-100 break-words">
                     {selectedLog.message}
                  </div>
               </div>

               {selectedLog.url && (
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">URL App</div>
                     <div className="text-gray-600 text-sm break-all bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {selectedLog.url}
                     </div>
                  </div>
               )}

               {selectedLog.userAgent && (
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">User Agent</div>
                     <div className="text-gray-600 text-sm break-all bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {selectedLog.userAgent}
                     </div>
                  </div>
               )}

               {selectedLog.stack && (
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Stack Trace (se disponibile)</div>
                     <div className="bg-gray-900 text-gray-300 font-mono text-xs p-4 rounded-xl overflow-x-auto">
                        <pre>{selectedLog.stack}</pre>
                     </div>
                  </div>
               )}
            </div>
            
            <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 px-6 pb-6 shrink-0">
               <button onClick={() => setSelectedLog(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition cursor-pointer flex justify-center shadow-sm">
                  Chiudi
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
