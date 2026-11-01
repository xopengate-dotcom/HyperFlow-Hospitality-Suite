export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  details?: any;
}

class LocalLogger {
  private logs: LogEntry[] = [];
  private static MAX_LOGS = 2000;

  constructor() {
    this.loadFromStorage();
    
    // Catch global unhandled errors
    window.addEventListener('error', (event) => {
      this.error('Global Error', event.error?.message || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', event.reason?.message || String(event.reason), {
        reason: event.reason?.stack || event.reason
      });
    });
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('hyperflow_debug_logs');
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to load logs from storage", e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('hyperflow_debug_logs', JSON.stringify(this.logs));
    } catch (e) {
      console.warn("Failed to save logs to storage", e);
    }
  }

  private addLog(level: LogLevel, source: string, message: string, details?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details: details instanceof Error ? { message: details.message, stack: details.stack } : details
    };

    console[level.toLowerCase() === 'debug' ? 'log' : level.toLowerCase() as any](`[${source}] ${message}`, details || '');

    this.logs.unshift(entry);
    
    if (this.logs.length > LocalLogger.MAX_LOGS) {
      this.logs = this.logs.slice(0, LocalLogger.MAX_LOGS);
    }

    this.saveToStorage();
  }

  info(source: string, message: string, details?: any) {
    this.addLog('INFO', source, message, details);
  }

  warn(source: string, message: string, details?: any) {
    this.addLog('WARN', source, message, details);
  }

  error(source: string, message: string, details?: any) {
    this.addLog('ERROR', source, message, details);
  }

  debug(source: string, message: string, details?: any) {
    this.addLog('DEBUG', source, message, details);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.saveToStorage();
  }

  downloadLogs() {
    const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hyperflow_debug_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const logger = new LocalLogger();
