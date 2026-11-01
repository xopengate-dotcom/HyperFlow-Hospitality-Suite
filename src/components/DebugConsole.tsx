import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry } from '../utils/logger';
import { X, Terminal, Trash2, Download, ChevronUp, ChevronDown } from 'lucide-react';

export function DebugConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial logs load
    setLogs(logger.getLogs());

    // Setup an interval to poll logs (simple reactivity since logger is static)
    const interval = setInterval(() => {
      setLogs(logger.getLogs());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, isOpen]);

  const clearLogs = () => {
    logger.clearLogs();
    setLogs([]);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-red-500';
      case 'WARN': return 'text-orange-500';
      case 'INFO': return 'text-blue-500';
      case 'DEBUG': return 'text-gray-400';
      default: return 'text-gray-600';
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-50 p-3 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition shadow-gray-900/20"
        title="Apri Console di Debug"
      >
        <Terminal size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[40vh] sm:h-[50vh] bg-gray-900 text-gray-300 z-[100] shadow-2xl flex flex-col font-mono text-xs sm:text-sm border-t border-gray-700 animate-in slide-in-from-bottom-full duration-300">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-950 border-b border-gray-800">
        <div className="flex items-center gap-2 text-gray-400 font-bold">
          <Terminal size={16} /> Debug Console
        </div>
        <div className="flex items-center gap-3">
          <button onClick={clearLogs} className="hover:text-white transition" title="Pulisci">
            <Trash2 size={16} />
          </button>
          <button onClick={() => logger.downloadLogs()} className="hover:text-white transition" title="Scarica">
            <Download size={16} />
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:text-white transition" title="Chiudi">
            <X size={18} />
          </button>
        </div>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {logs.length === 0 ? (
          <div className="text-gray-600 italic">Nessun log presente...</div>
        ) : (
          [...logs].reverse().map((log, idx) => (
            <div key={idx} className="border-b border-gray-800 pb-2 break-words">
              <div className="flex gap-2">
                <span className="text-gray-500 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`font-bold shrink-0 ${getLevelColor(log.level)}`}>[{log.level}]</span>
                <span className="text-purple-400 shrink-0">[{log.source}]</span>
                <span className="text-gray-100">{log.message}</span>
              </div>
              {log.details && (
                <div className="mt-1 ml-4 p-2 bg-gray-950 rounded text-gray-400 overflow-x-auto">
                  {typeof log.details === 'object' 
                    ? JSON.stringify(log.details, null, 2)
                    : String(log.details)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
