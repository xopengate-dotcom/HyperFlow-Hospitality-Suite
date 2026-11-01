import React, { useState, useMemo } from 'react';
import { Item, Transaction } from '../types';
import { useSettings } from './SettingsProvider';
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  FileText, 
  FileDown, 
  FileSpreadsheet, 
  Calendar, 
  MapPin, 
  Layers, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  Home, 
  Tag, 
  TrendingUp, 
  ArrowUpDown, 
  Search,
  Filter,
  X
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface LinenConsumptionRow {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  byDate: Record<string, number>;
  totalOut: number;
  totalIn: number;
  totalNet: number;
}

interface HousekeepingConsumiReportProps {
  items: Item[];
  transactions: Transaction[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function HousekeepingConsumiReport({
  items,
  transactions,
  loading,
  onRefresh
}: HousekeepingConsumiReportProps) {
  const { settings } = useSettings();
  const { properties, apartments, propertyApartments, apartmentProperty } = settings;

  // Filter States
  const [selectedProperty, setSelectedProperty] = useState<string>(properties[0] || 'Tutte');
  const [selectedApartment, setSelectedApartment] = useState<string>('Tutti');
  const [selectedTipologia, setSelectedTipologia] = useState<string>('Tutte');
  
  // Default date range: start of current month to today
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // Category filter: default to Linen only
  const [onlyLinen, setOnlyLinen] = useState<boolean>(true);
  const [tableSearch, setTableSearch] = useState<string>('');
  const [activeSubView, setActiveSubView] = useState<'matrice' | 'riepilogo' | 'dettaglio'>('matrice');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'summary_pdf' | 'complete_pdf' | 'excel'>('summary_pdf');
  const [modalTipologia, setModalTipologia] = useState<string>('Tutte');

  // Quick date presets
  const handlePreset = (type: 'currentMonth' | 'last30' | 'lastMonth' | 'all') => {
    const today = new Date();
    if (type === 'currentMonth') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (type === 'last30') {
      setStartDate(format(subDays(today, 30), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (type === 'lastMonth') {
      const prev = subMonths(today, 1);
      setStartDate(format(startOfMonth(prev), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(prev), 'yyyy-MM-dd'));
    } else if (type === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Build items dictionary
  const itemsById = useMemo(() => {
    const map: Record<string, Item> = {};
    items.forEach(it => {
      map[it.id] = it;
    });
    return map;
  }, [items]);

  // Helper to check if an item/transaction is linen
  const isLinenItem = (itemName: string, category?: string) => {
    const cat = (category || '').toLowerCase();
    const name = (itemName || '').toLowerCase();
    if (cat.includes('biancheria') || cat.includes('noleggio')) return true;
    if (
      name.includes('lenzuol') || 
      name.includes('federa') || 
      name.includes('telo') || 
      name.includes('asciugaman') || 
      name.includes('bidet') || 
      name.includes('scendibagno') || 
      name.includes('coprimaterasso') || 
      name.includes('accappatoio') || 
      name.includes('federe')
    ) {
      return true;
    }
    return false;
  };

  // Base Housekeeping transactions matching property, apartment, date and linen filters
  const baseTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. Must be housekeeping movement
      const isHk = t.notes?.includes('Consumi/Refill Housekeeping') || 
                   t.notes?.includes('Housekeeping') || 
                   Boolean(t.apartment);
      if (!isHk) return false;

      // 2. Date filter
      const tDateStr = format(t.date, 'yyyy-MM-dd');
      if (startDate && tDateStr < startDate) return false;
      if (endDate && tDateStr > endDate) return false;

      // 3. Property filter
      const txProp = t.property || (t.apartment ? apartmentProperty[t.apartment] : undefined);
      if (selectedProperty !== 'Tutte' && txProp !== selectedProperty) {
        return false;
      }

      // 4. Apartment filter
      if (selectedApartment !== 'Tutti' && t.apartment !== selectedApartment) {
        return false;
      }

      // 5. Category filter (Biancheria)
      const refItem = itemsById[t.itemId];
      const itemCat = refItem?.category || '';
      if (onlyLinen && !isLinenItem(t.itemName, itemCat)) {
        return false;
      }

      return true;
    });
  }, [transactions, startDate, endDate, selectedProperty, selectedApartment, onlyLinen, itemsById, apartmentProperty]);

  // Available Tipologie (sorted distinct items)
  const availableTipologie = useMemo(() => {
    const set = new Set<string>();
    baseTransactions.forEach(t => {
      const refItem = itemsById[t.itemId];
      set.add(refItem?.name || t.itemName);
    });
    items.forEach(it => {
      if (onlyLinen && !isLinenItem(it.name, it.category)) return;
      set.add(it.name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  }, [baseTransactions, items, itemsById, onlyLinen]);

  // Filtered transactions (accounting for selectedTipologia)
  const filteredTransactions = useMemo(() => {
    if (selectedTipologia === 'Tutte') {
      return baseTransactions;
    }
    return baseTransactions.filter(t => {
      const refItem = itemsById[t.itemId];
      const effectiveName = refItem?.name || t.itemName;
      return effectiveName === selectedTipologia || t.itemName === selectedTipologia;
    });
  }, [baseTransactions, selectedTipologia, itemsById]);

  // Unique sorted dates
  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    filteredTransactions.forEach(t => {
      set.add(format(t.date, 'yyyy-MM-dd'));
    });
    return Array.from(set).sort();
  }, [filteredTransactions]);

  // Aggregate consumption rows by linen type
  const consumptionData = useMemo(() => {
    const rowsMap: Record<string, LinenConsumptionRow> = {};

    filteredTransactions.forEach(t => {
      const refItem = itemsById[t.itemId];
      const key = refItem?.name || t.itemName;
      const tDateStr = format(t.date, 'yyyy-MM-dd');
      const qty = Number(t.quantity) || 0;

      if (!rowsMap[key]) {
        rowsMap[key] = {
          itemId: t.itemId,
          itemName: key,
          category: refItem?.category || (isLinenItem(key) ? 'Biancheria' : 'Housekeeping'),
          unit: refItem?.unit || 'pz',
          byDate: {},
          totalOut: 0,
          totalIn: 0,
          totalNet: 0
        };
      }

      const row = rowsMap[key];
      if (!row.byDate[tDateStr]) {
        row.byDate[tDateStr] = 0;
      }

      if (t.type === 'out') {
        row.totalOut += qty;
        row.byDate[tDateStr] += qty;
      } else if (t.type === 'in') {
        row.totalIn += qty;
        row.byDate[tDateStr] -= qty;
      }
    });

    // Compute net totals per row
    const result = Object.values(rowsMap).map(row => {
      // Net is prelievi - resi
      const net = Math.max(0, row.totalOut - row.totalIn);
      return {
        ...row,
        totalNet: net
      };
    });

    // Sort by name
    return result.sort((a, b) => b.totalNet - a.totalNet || a.itemName.localeCompare(b.itemName));
  }, [filteredTransactions, itemsById]);

  // Filtered rows by search
  const displayedRows = useMemo(() => {
    if (!tableSearch.trim()) return consumptionData;
    const q = tableSearch.toLowerCase();
    return consumptionData.filter(r => 
      r.itemName.toLowerCase().includes(q) || 
      r.category.toLowerCase().includes(q)
    );
  }, [consumptionData, tableSearch]);

  // Totals of the period
  const { grandTotalNet, totalPrelevati, totalResi, totalsByDate } = useMemo(() => {
    let totNet = 0;
    let totOut = 0;
    let totIn = 0;
    const dateSums: Record<string, number> = {};

    uniqueDates.forEach(d => {
      dateSums[d] = 0;
    });

    consumptionData.forEach(r => {
      totNet += r.totalNet;
      totOut += r.totalOut;
      totIn += r.totalIn;
      uniqueDates.forEach(d => {
        const val = r.byDate[d] || 0;
        dateSums[d] += val;
      });
    });

    return {
      grandTotalNet: totNet,
      totalPrelevati: totOut,
      totalResi: totIn,
      totalsByDate: dateSums
    };
  }, [consumptionData, uniqueDates]);

  // Available apartments for the selected property
  const availableApartments = useMemo(() => {
    if (selectedProperty === 'Tutte') {
      return apartments;
    }
    return propertyApartments[selectedProperty] || [];
  }, [selectedProperty, apartments, propertyApartments]);

  const formatDateDMY = (dStr: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dStr;
  };

  // Export to PDF
  const handleExportPDF = () => {
    setIsExporting(true);
    try {
      const isLandscape = uniqueDates.length > 5;
      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top colored banner
      doc.setFillColor(37, 99, 235); // Blue-600
      doc.rect(0, 0, pageWidth, 24, 'F');

      // Title & Subtitle inside banner
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORT CONSUMI BIANCHERIA', 14, 15);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('HyperFlow Hospitality Suite', pageWidth - 14, 15, { align: 'right' });

      // Subtitle / Filters Info Box
      doc.setTextColor(30, 41, 59);
      let yPos = 32;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Proprietà: ', 14, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(selectedProperty || 'Tutte le Proprietà', 35, yPos);

      if (selectedApartment && selectedApartment !== 'Tutti') {
        doc.setFont('helvetica', 'bold');
        doc.text('Appartamento: ', isLandscape ? 120 : 90, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(selectedApartment, isLandscape ? 150 : 120, yPos);
      }

      if (selectedTipologia && selectedTipologia !== 'Tutte') {
        yPos += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Tipologia: ', 14, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(selectedTipologia, 35, yPos);
      }

      yPos += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Periodo: ', 14, yPos);
      doc.setFont('helvetica', 'normal');
      const periodText = (startDate || endDate) 
        ? `Dal ${formatDateDMY(startDate) || 'Inizio'} Al ${formatDateDMY(endDate) || 'Oggi'}` 
        : 'Tutto lo storico';
      doc.text(periodText, 35, yPos);

      const printDateStr = `Emesso il: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
      doc.setFont('helvetica', 'normal');
      doc.text(printDateStr, pageWidth - 14, yPos, { align: 'right' });

      // Summary KPI banner
      yPos += 8;
      doc.setFillColor(248, 250, 252); // Gray-50
      doc.setDrawColor(226, 232, 240); // Gray-200
      doc.roundedRect(14, yPos, pageWidth - 28, 14, 2, 2, 'FD');

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('TOTALE BIANCHERIA UTILIZZATA NEL PERIODO: ', 18, yPos + 9);
      
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${grandTotalNet} pezzi`, isLandscape ? 115 : 100, yPos + 9.5);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Tipologie: ${consumptionData.length}  |  Giorni rilevati: ${uniqueDates.length}  |  Prelevati: ${totalPrelevati}  |  Resi: ${totalResi}`, 
        pageWidth - 18, 
        yPos + 9, 
        { align: 'right' }
      );

      yPos += 20;

      // Table 1: Cross-tab Matrix by Date & Linen Type (with Row Totals and Period Total)
      if (consumptionData.length > 0 && uniqueDates.length > 0) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Matrice Consumi per Data e Tipologia Biancheria', 14, yPos - 3);

        const headCols = ['Tipologia Biancheria', 'U.M.'];
        uniqueDates.forEach(d => {
          headCols.push(format(new Date(d + 'T00:00:00'), 'dd/MM'));
        });
        headCols.push('Totale Riga');

        const bodyRows: any[] = [];
        consumptionData.forEach(r => {
          const row = [r.itemName, r.unit || 'pz'];
          uniqueDates.forEach(d => {
            const q = r.byDate[d] || 0;
            row.push(q > 0 ? String(q) : q < 0 ? String(q) : '-');
          });
          row.push(String(r.totalNet)); // Totale per riga
          bodyRows.push(row);
        });

        // Footer row: Totali del Periodo per data e gran totale
        const footerRow = ['TOTALE DEL PERIODO', '-'];
        uniqueDates.forEach(d => {
          const colTot = totalsByDate[d] || 0;
          footerRow.push(String(colTot));
        });
        footerRow.push(String(grandTotalNet));

        autoTable(doc, {
          startY: yPos,
          head: [headCols],
          body: bodyRows,
          foot: [footerRow],
          theme: 'grid',
          headStyles: {
            fillColor: [30, 41, 59], // Slate-800
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8
          },
          footStyles: {
            fillColor: [224, 231, 255], // Indigo-100
            textColor: [30, 58, 138], // Blue-900
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8.5
          },
          styles: {
            fontSize: 7.5,
            cellPadding: 2,
            halign: 'center'
          },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: isLandscape ? 48 : 36 },
            1: { halign: 'center', cellWidth: 10 },
            [headCols.length - 1]: { halign: 'center', fontStyle: 'bold', textColor: [37, 99, 235] }
          },
          margin: { left: 14, right: 14 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      // Check page break for Table 2
      if (yPos > (pageHeight - 60)) {
        doc.addPage();
        yPos = 20;
      }

      // Table 2: Tabella Riepilogo Totali per Tipologia Biancheria
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Riepilogo Totali per Tipologia Biancheria', 14, yPos - 3);

      const summaryHead = ['N°', 'Tipologia Biancheria', 'Categoria', 'U.M.', 'Quantità Prelevata', 'Resi Magazzino', 'Totale Utilizzato (Riga)', '% Incidenza'];
      const summaryBody = consumptionData.map((r, idx) => {
        const incidenza = grandTotalNet > 0 ? ((r.totalNet / grandTotalNet) * 100).toFixed(1) + '%' : '0%';
        return [
          String(idx + 1),
          r.itemName,
          r.category,
          r.unit,
          String(r.totalOut),
          String(r.totalIn),
          String(r.totalNet),
          incidenza
        ];
      });

      const summaryFoot = [
        '',
        'TOTALE COMPLESSIVO DEL PERIODO',
        '-',
        '-',
        String(totalPrelevati),
        String(totalResi),
        String(grandTotalNet),
        '100%'
      ];

      autoTable(doc, {
        startY: yPos,
        head: [summaryHead],
        body: summaryBody,
        foot: [summaryFoot],
        theme: 'striped',
        headStyles: {
          fillColor: [37, 99, 235], // Blue-600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        footStyles: {
          fillColor: [241, 245, 249], // Slate-100
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center'
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { halign: 'left', fontStyle: 'bold' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold', textColor: [37, 99, 235] },
          7: { halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;

      // Table 3: Dettaglio Cronologico Movimenti per Data
      if (filteredTransactions.length > 0) {
        if (yPos > (pageHeight - 50)) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Dettaglio Cronologico Movimenti del Periodo', 14, yPos - 3);

        const txHead = ['Data e Ora', 'Proprietà / Alloggio', 'Articolo / Biancheria', 'Operazione', 'Quantità', 'Operatore'];
        const txBody = [...filteredTransactions]
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .map(t => [
            format(t.date, 'dd/MM/yyyy HH:mm'),
            t.apartment ? `${t.property || ''} (${t.apartment})` : (t.property || '-'),
            t.itemName,
            t.type === 'in' ? 'Reso a magazzino' : 'Prelievo (Consumo)',
            t.type === 'in' ? `+${t.quantity}` : `-${t.quantity}`,
            t.operator || '-'
          ]);

        autoTable(doc, {
          startY: yPos,
          head: [txHead],
          body: txBody,
          theme: 'grid',
          headStyles: {
            fillColor: [71, 85, 105], // Slate-600
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.5,
            halign: 'center'
          },
          styles: {
            fontSize: 7,
            cellPadding: 1.8,
            halign: 'center'
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 28 },
            1: { halign: 'left' },
            2: { halign: 'left', fontStyle: 'bold' },
            3: { halign: 'center' },
            4: { halign: 'right', fontStyle: 'bold' },
            5: { halign: 'center' }
          },
          margin: { left: 14, right: 14 }
        });
      }

      // Page numbers footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Pagina ${i} di ${pageCount} - HyperFlow Report Consumi Biancheria`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const safeProp = (selectedProperty || 'Tutte').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeTipo = selectedTipologia !== 'Tutte' ? `_${selectedTipologia.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
      const filename = `Report_Consumi_Biancheria_${safeProp}${safeTipo}_${startDate || 'inizio'}_${endDate || 'oggi'}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Errore generazione PDF:', err);
      alert('Si è verificato un errore durante la generazione del PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // Export to PDF - SOLO RIEPILOGO PER TIPOLOGIA (Sintetico: Dal - Al, solo totali consumati per tipologia, senza dettaglio giorni)
  const handleExportPDFSummaryOnly = (overrideTipologia?: string) => {
    setIsExporting(true);
    try {
      const targetTipo = overrideTipologia !== undefined ? overrideTipologia : selectedTipologia;
      
      // Determine rows to export
      let rowsToExport = consumptionData;
      if (targetTipo !== 'Tutte' && selectedTipologia === 'Tutte') {
        rowsToExport = consumptionData.filter(r => r.itemName === targetTipo);
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top colored banner
      doc.setFillColor(37, 99, 235); // Blue-600
      doc.rect(0, 0, pageWidth, 24, 'F');

      // Title & Subtitle inside banner
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORT CONSUMI - RIEPILOGO TIPOLOGIE', 14, 15);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('HyperFlow Hospitality Suite', pageWidth - 14, 15, { align: 'right' });

      // Subtitle / Filters Info Box
      doc.setTextColor(30, 41, 59);
      let yPos = 32;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Proprietà: ', 14, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(selectedProperty || 'Tutte le Proprietà', 36, yPos);

      if (selectedApartment && selectedApartment !== 'Tutti') {
        doc.setFont('helvetica', 'bold');
        doc.text('Appartamento: ', 110, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(selectedApartment, 138, yPos);
      }

      yPos += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Periodo: ', 14, yPos);
      doc.setFont('helvetica', 'normal');
      const periodText = (startDate || endDate) 
        ? `Dal ${formatDateDMY(startDate) || 'Inizio'} Al ${formatDateDMY(endDate) || 'Oggi'}` 
        : 'Tutto lo storico';
      doc.text(periodText, 36, yPos);

      const printDateStr = `Emesso il: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
      doc.setFont('helvetica', 'normal');
      doc.text(printDateStr, pageWidth - 14, yPos, { align: 'right' });

      yPos += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Filtro Tipologia: ', 14, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(targetTipo === 'Tutte' ? 'Tutte le tipologie movimentate' : targetTipo, 45, yPos);

      // Totals calculation for exported rows
      const sumNet = rowsToExport.reduce((acc, r) => acc + r.totalNet, 0);
      const sumOut = rowsToExport.reduce((acc, r) => acc + r.totalOut, 0);
      const sumIn = rowsToExport.reduce((acc, r) => acc + r.totalIn, 0);

      // Summary KPI banner
      yPos += 8;
      doc.setFillColor(248, 250, 252); // Gray-50
      doc.setDrawColor(226, 232, 240); // Gray-200
      doc.roundedRect(14, yPos, pageWidth - 28, 15, 2, 2, 'FD');

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('TOTALE BIANCHERIA UTILIZZATA NEL PERIODO: ', 18, yPos + 10);
      
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(`${sumNet} pezzi`, 112, yPos + 10.5);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Tipologie: ${rowsToExport.length}  |  Prelevati: ${sumOut}  |  Resi: ${sumIn}`, 
        pageWidth - 18, 
        yPos + 10, 
        { align: 'right' }
      );

      yPos += 24;

      // Table: Riepilogo Totali per Tipologia (Senza dettaglio giorni)
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Riepilogo Totali Consumati per Tipologia', 14, yPos - 3);

      const summaryHead = ['N°', 'Tipologia Biancheria', 'Categoria', 'U.M.', 'Quantità Prelevata', 'Resi Magazzino', 'Totale Utilizzato (Riga)', '% Incidenza'];
      const summaryBody = rowsToExport.map((r, idx) => {
        const incidenza = sumNet > 0 ? ((r.totalNet / sumNet) * 100).toFixed(1) + '%' : '0%';
        return [
          String(idx + 1),
          r.itemName,
          r.category,
          r.unit,
          String(r.totalOut),
          String(r.totalIn),
          String(r.totalNet),
          incidenza
        ];
      });

      const summaryFoot = [
        '',
        'TOTALE COMPLESSIVO DEL PERIODO',
        '-',
        '-',
        String(sumOut),
        String(sumIn),
        String(sumNet),
        '100%'
      ];

      autoTable(doc, {
        startY: yPos,
        head: [summaryHead],
        body: summaryBody,
        foot: [summaryFoot],
        theme: 'striped',
        headStyles: {
          fillColor: [37, 99, 235], // Blue-600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        footStyles: {
          fillColor: [241, 245, 249], // Slate-100
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center'
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2.5,
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { halign: 'left', fontStyle: 'bold' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold', textColor: [37, 99, 235] },
          7: { halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 12;
      if (finalY < pageHeight - 20) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(148, 163, 184);
        doc.text(
          '* Prospetto sintetico di riepilogo consumi per tipologia nel periodo indicato. Esclude la matrice giornaliera.',
          14,
          finalY
        );
      }

      // Page numbers footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Pagina ${i} di ${pageCount} - HyperFlow Hospitality Suite`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const safeProp = (selectedProperty || 'Tutte').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeTipo = (targetTipo || 'Tutte').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Report_Consumi_Sintetico_${safeProp}_${safeTipo}_${startDate || 'inizio'}_${endDate || 'oggi'}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Errore generazione PDF sintetico:', err);
      alert('Si è verificato un errore durante la generazione del PDF sintetico.');
    } finally {
      setIsExporting(false);
    }
  };

  const executeExportFromModal = () => {
    setIsExportModalOpen(false);
    if (exportFormat === 'summary_pdf') {
      handleExportPDFSummaryOnly(modalTipologia);
    } else if (exportFormat === 'complete_pdf') {
      handleExportPDF();
    } else if (exportFormat === 'excel') {
      handleExportExcel();
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Matrice Consumi
      const matrixData: any[] = [];
      matrixData.push(['REPORT CONSUMI BIANCHERIA']);
      matrixData.push([`Proprietà: ${selectedProperty}`, `Appartamento: ${selectedApartment}`, `Periodo: ${startDate || 'Inizio'} - ${endDate || 'Oggi'}`]);
      matrixData.push([]);

      const header = ['Tipologia Biancheria', 'U.M.', ...uniqueDates.map(d => formatDateDMY(d)), 'Totale Riga'];
      matrixData.push(header);

      consumptionData.forEach(r => {
        const row = [r.itemName, r.unit || 'pz'];
        uniqueDates.forEach(d => {
          row.push(r.byDate[d] || 0);
        });
        row.push(r.totalNet);
        matrixData.push(row);
      });

      const footer = [
        'TOTALE DEL PERIODO',
        '-',
        ...uniqueDates.map(d => totalsByDate[d] || 0),
        grandTotalNet
      ];
      matrixData.push(footer);

      const wsMatrix = XLSX.utils.aoa_to_sheet(matrixData);
      XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matrice Consumi');

      // Sheet 2: Riepilogo Tipologie
      const summaryData = [
        ['N°', 'Tipologia Biancheria', 'Categoria', 'U.M.', 'Prelevati', 'Resi', 'Totale Utilizzato (Riga)', '% Incidenza'],
        ...consumptionData.map((r, i) => [
          i + 1,
          r.itemName,
          r.category,
          r.unit,
          r.totalOut,
          r.totalIn,
          r.totalNet,
          grandTotalNet > 0 ? Number(((r.totalNet / grandTotalNet) * 100).toFixed(1)) : 0
        ]),
        ['', 'TOTALE COMPLESSIVO DEL PERIODO', '-', '-', totalPrelevati, totalResi, grandTotalNet, 100]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Riepilogo Tipologie');

      // Sheet 3: Dettaglio Movimenti
      if (filteredTransactions.length > 0) {
        const txData = [
          ['Data e Ora', 'Proprietà', 'Appartamento', 'Articolo', 'Tipo Movimento', 'Quantità', 'Operatore'],
          ...filteredTransactions.map(t => [
            format(t.date, 'yyyy-MM-dd HH:mm'),
            t.property || '',
            t.apartment || '',
            t.itemName,
            t.type === 'in' ? 'Reso a magazzino' : 'Prelievo (Consumo)',
            t.quantity,
            t.operator || ''
          ])
        ];
        const wsTx = XLSX.utils.aoa_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, wsTx, 'Dettaglio Movimenti');
      }

      const safeProp = (selectedProperty || 'Tutte').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Report_Consumi_Biancheria_${safeProp}_${startDate || 'inizio'}_${endDate || 'oggi'}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Errore export Excel:', err);
      alert('Si è verificato un errore durante la generazione del file Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileText size={22} />
            </span>
            <h2 className="text-xl font-black text-gray-900">
              Report Consumi Biancheria
            </h2>
          </div>
          <p className="text-gray-500 mt-1 text-sm">
            Calcolo analitico e matrice consumi per tipologia, date e totali di periodo con esportazione documentale.
          </p>
        </div>

        {/* Action Export Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition cursor-pointer"
            title="Aggiorna Dati"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Quick Button: Solo Riepilogo per Tipologia */}
          <button
            onClick={() => handleExportPDFSummaryOnly()}
            disabled={isExporting || consumptionData.length === 0}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 text-sm"
            title="Esporta solo il riepilogo con i totali consumati per tipologia nel periodo, senza dettaglio giorni"
          >
            {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
            <span>Solo Riepilogo (PDF)</span>
          </button>

          {/* Modal for all export formats */}
          <button
            onClick={() => {
              setModalTipologia(selectedTipologia);
              setIsExportModalOpen(true);
            }}
            disabled={isExporting || consumptionData.length === 0}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-red-600 text-white font-medium hover:bg-red-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 text-sm"
            title="Scegli se esportare il riepilogo sintetico, il report completo con date o Excel"
          >
            <FileDown size={16} />
            <span>Esporta...</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || consumptionData.length === 0}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 text-sm"
          >
            <FileSpreadsheet size={16} />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Property Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Home size={14} className="text-gray-400" />
              Proprietà
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => {
                setSelectedProperty(e.target.value);
                setSelectedApartment('Tutti');
              }}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 cursor-pointer text-sm"
            >
              <option value="Tutte">Tutte le Proprietà</option>
              {properties.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Apartment Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin size={14} className="text-gray-400" />
              Appartamento
            </label>
            <select
              value={selectedApartment}
              onChange={(e) => setSelectedApartment(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 cursor-pointer text-sm"
            >
              <option value="Tutti">Tutti gli Alloggi</option>
              {availableApartments.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Tipologia Biancheria Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Tag size={14} className="text-gray-400" />
              Tipologia
            </label>
            <select
              value={selectedTipologia}
              onChange={(e) => setSelectedTipologia(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 cursor-pointer text-sm"
            >
              <option value="Tutte">Tutte le Tipologie</option>
              {availableTipologie.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-gray-400" />
              Data Inizio
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 cursor-pointer text-sm"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-gray-400" />
              Data Fine
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 cursor-pointer text-sm"
            />
          </div>
        </div>

        {/* Quick Presets & Category Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-400 uppercase mr-1">Periodo:</span>
            <button
              onClick={() => handlePreset('currentMonth')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition cursor-pointer"
            >
              Mese Corrente
            </button>
            <button
              onClick={() => handlePreset('last30')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition cursor-pointer"
            >
              Ultimi 30 gg
            </button>
            <button
              onClick={() => handlePreset('lastMonth')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition cursor-pointer"
            >
              Mese Scorso
            </button>
            <button
              onClick={() => handlePreset('all')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition cursor-pointer"
            >
              Tutto
            </button>
          </div>

          {/* Category Filter Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyLinen(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                onlyLinen ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <CheckCircle2 size={14} className={onlyLinen ? 'opacity-100' : 'opacity-0'} />
              Solo Biancheria
            </button>
            <button
              onClick={() => setOnlyLinen(false)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                !onlyLinen ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Layers size={14} />
              Tutte le Categorie
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Linen Used */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Totale Utilizzato</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <TrendingUp size={18} />
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900">
              {grandTotalNet}
            </div>
            <div className="text-xs text-gray-500 mt-1 font-medium">
              pezzi nel periodo selezionato
            </div>
          </div>
        </div>

        {/* Card 2: Distinct Linen Types */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Tipologie</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Tag size={18} />
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900">
              {consumptionData.length}
            </div>
            <div className="text-xs text-gray-500 mt-1 font-medium">
              articoli movimentati
            </div>
          </div>
        </div>

        {/* Card 3: Days with Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Giorni Rilevati</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Calendar size={18} />
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900">
              {uniqueDates.length}
            </div>
            <div className="text-xs text-gray-500 mt-1 font-medium">
              date con prelievi registrati
            </div>
          </div>
        </div>

        {/* Card 4: Prelevati vs Resi */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Flussi Magazzino</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowUpDown size={18} />
            </span>
          </div>
          <div>
            <div className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
              <span className="text-blue-600">-{totalPrelevati}</span>
              <span className="text-gray-300">/</span>
              <span className="text-green-600">+{totalResi}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1 font-medium">
              prelievi vs resi a magazzino
            </div>
          </div>
        </div>
      </div>

      {/* Sub-view Navigation & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubView('matrice')}
            className={`px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition cursor-pointer ${
              activeSubView === 'matrice' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Matrice Consumi per Data
          </button>
          <button
            onClick={() => setActiveSubView('riepilogo')}
            className={`px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition cursor-pointer ${
              activeSubView === 'riepilogo' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Riepilogo Tipologie
          </button>
          <button
            onClick={() => setActiveSubView('dettaglio')}
            className={`px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition cursor-pointer ${
              activeSubView === 'dettaglio' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Registro Movimenti ({filteredTransactions.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca articolo..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition text-sm font-medium"
          />
        </div>
      </div>

      {/* Main Content Areas */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 flex flex-col items-center justify-center">
          <RefreshCw size={32} className="animate-spin text-blue-600 mb-3" />
          <p className="text-sm font-medium text-gray-500">Caricamento dati consumi in corso...</p>
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText size={32} />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">Nessun consumo registrato</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Non risultano movimenti di biancheria per la proprietà selezionata nell'intervallo temporale impostato. Prova a modificare i filtri o la data.
          </p>
        </div>
      ) : (
        <>
          {/* View 1: Matrice per Data e Tipologia */}
          {activeSubView === 'matrice' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sticky left-0 bg-gray-50 z-10 shadow-[1px_0_0_0_#f3f4f6]">
                        Tipologia Biancheria
                      </th>
                      <th className="py-3.5 px-3 text-center">U.M.</th>
                      {uniqueDates.map(d => (
                        <th key={d} className="py-3.5 px-3 text-center whitespace-nowrap">
                          {format(new Date(d + 'T00:00:00'), 'dd/MM')}
                        </th>
                      ))}
                      <th className="py-3.5 px-4 text-right bg-blue-50/60 text-blue-900 font-black sticky right-0 z-10 shadow-[-1px_0_0_0_#e0e7ff]">
                        Totale Riga
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {displayedRows.map(row => (
                      <tr key={row.itemName} className="hover:bg-gray-50/80 transition">
                        <td className="py-3 px-4 font-bold text-gray-900 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#f3f4f6]">
                          {row.itemName}
                        </td>
                        <td className="py-3 px-3 text-center text-xs text-gray-500 font-medium">
                          {row.unit}
                        </td>
                        {uniqueDates.map(d => {
                          const val = row.byDate[d] || 0;
                          return (
                            <td key={d} className="py-3 px-3 text-center font-semibold">
                              {val > 0 ? (
                                <span className="inline-flex items-center justify-center min-w-6 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-xs">
                                  {val}
                                </span>
                              ) : val < 0 ? (
                                <span className="inline-flex items-center justify-center min-w-6 px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md font-bold text-xs">
                                  {val}
                                </span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-right font-black text-blue-700 text-base bg-blue-50/30 sticky right-0 z-10 shadow-[-1px_0_0_0_#e0e7ff]">
                          {row.totalNet}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100/80 border-t-2 border-gray-200 text-sm font-black text-gray-900">
                      <td className="py-3.5 px-4 sticky left-0 bg-gray-100 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                        TOTALE DEL PERIODO
                      </td>
                      <td className="py-3.5 px-3 text-center text-gray-500 font-bold">-</td>
                      {uniqueDates.map(d => {
                        const colTot = totalsByDate[d] || 0;
                        return (
                          <td key={d} className="py-3.5 px-3 text-center text-gray-900 font-black">
                            {colTot > 0 ? colTot : '-'}
                          </td>
                        );
                      })}
                      <td className="py-3.5 px-4 text-right font-black text-blue-800 text-lg bg-blue-100 sticky right-0 z-10 shadow-[-1px_0_0_0_#bfdbfe]">
                        {grandTotalNet}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* View 2: Tabella Riepilogo per Tipologia */}
          {activeSubView === 'riepilogo' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Prospetto header bar */}
              <div className="p-4 bg-gray-50/60 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h4 className="text-sm font-black text-gray-900">
                    Riepilogo Totali per Tipologia (Senza Dettaglio Giorni)
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Totali consumati e movimentati nel periodo per ciascuna tipologia.
                  </p>
                </div>
                <button
                  onClick={() => handleExportPDFSummaryOnly()}
                  disabled={isExporting || displayedRows.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 text-xs"
                  title="Scarica PDF sintetico con solo i totali consumati per tipologia"
                >
                  <FileText size={15} />
                  <span>Esporta Solo Questo Riepilogo (PDF)</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 w-12 text-center">#</th>
                      <th className="py-3.5 px-4">Tipologia Biancheria</th>
                      <th className="py-3.5 px-4">Categoria</th>
                      <th className="py-3.5 px-3 text-center">U.M.</th>
                      <th className="py-3.5 px-4 text-right text-gray-600">Prelevati</th>
                      <th className="py-3.5 px-4 text-right text-gray-600">Resi</th>
                      <th className="py-3.5 px-4 text-right text-blue-900 font-black bg-blue-50/50">
                        Totale Utilizzato (Riga)
                      </th>
                      <th className="py-3.5 px-4 w-40 text-right">% Incidenza</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {displayedRows.map((row, idx) => {
                      const perc = grandTotalNet > 0 ? Math.round((row.totalNet / grandTotalNet) * 100) : 0;
                      return (
                        <tr key={row.itemName} className="hover:bg-gray-50/80 transition">
                          <td className="py-3.5 px-4 text-center font-bold text-gray-400 text-xs">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-gray-900">
                            {row.itemName}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-semibold text-gray-500">
                            {row.category}
                          </td>
                          <td className="py-3.5 px-3 text-center text-xs text-gray-500 font-medium">
                            {row.unit}
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-gray-700">
                            {row.totalOut}
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-gray-700">
                            {row.totalIn > 0 ? `+${row.totalIn}` : '0'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-blue-700 text-base bg-blue-50/30">
                            {row.totalNet}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${Math.min(100, perc)}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-gray-600 min-w-8">
                                {perc}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100/80 border-t-2 border-gray-200 text-sm font-black text-gray-900">
                      <td colSpan={4} className="py-3.5 px-4 text-left">
                        TOTALE COMPLESSIVO DEL PERIODO
                      </td>
                      <td className="py-3.5 px-4 text-right text-gray-700">{totalPrelevati}</td>
                      <td className="py-3.5 px-4 text-right text-gray-700">+{totalResi}</td>
                      <td className="py-3.5 px-4 text-right text-blue-800 text-lg bg-blue-100">
                        {grandTotalNet}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-gray-700">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* View 3: Registro Analitico Movimenti */}
          {activeSubView === 'dettaglio' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Data e Ora</th>
                      <th className="py-3.5 px-4">Alloggio / Proprietà</th>
                      <th className="py-3.5 px-4">Articolo</th>
                      <th className="py-3.5 px-4 text-center">Operazione</th>
                      <th className="py-3.5 px-4 text-right">Quantità</th>
                      <th className="py-3.5 px-4 text-center">Operatore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {[...filteredTransactions]
                      .sort((a, b) => b.date.getTime() - a.date.getTime())
                      .map(t => (
                        <tr key={t.id} className="hover:bg-gray-50/80 transition">
                          <td className="py-3 px-4 font-semibold text-gray-700 text-xs">
                            {format(t.date, 'dd/MM/yyyy HH:mm')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900 text-sm">
                              {t.apartment || t.property || '-'}
                            </div>
                            {t.property && t.apartment && (
                              <div className="text-[11px] text-gray-400">
                                {t.property}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-gray-900">
                            {t.itemName}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {t.type === 'in' ? (
                              <span className="inline-flex px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold text-xs">
                                Reso
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-xs">
                                Prelievo
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-base">
                            <span className={t.type === 'in' ? 'text-green-600' : 'text-blue-600'}>
                              {t.type === 'in' ? '+' : '-'}{t.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-xs font-semibold text-gray-600">
                            {t.operator || '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Export Options Modal (HyperFlow Standard) */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <FileDown className="text-blue-600" size={22} />
                Esportazione Report Consumi
              </h3>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition cursor-pointer"
                title="Chiudi"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form / Content */}
            <div className="px-6 py-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Formato di Esportazione
                </label>
                <div className="space-y-3">
                  {/* Option 1: Solo Riepilogo per Tipologia */}
                  <button
                    type="button"
                    onClick={() => setExportFormat('summary_pdf')}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
                      exportFormat === 'summary_pdf'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-800'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${exportFormat === 'summary_pdf' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <FileText size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">PDF Solo Riepilogo per Tipologia</span>
                        <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-md uppercase">Consigliato</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Esporta per il periodo solo i totali consumati per tipologia, senza entrare nel dettaglio dei singoli giorni.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Completo con Matrice Giornaliera */}
                  <button
                    type="button"
                    onClick={() => setExportFormat('complete_pdf')}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
                      exportFormat === 'complete_pdf'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-800'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${exportFormat === 'complete_pdf' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Layers size={20} />
                    </div>
                    <div className="flex-1">
                      <span className="font-bold text-sm">PDF Completo Analitico</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Include matrice per data con totali riga e periodo, tabella riepilogo e registro dettagliato movimenti.
                      </p>
                    </div>
                  </button>

                  {/* Option 3: Excel */}
                  <button
                    type="button"
                    onClick={() => setExportFormat('excel')}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
                      exportFormat === 'excel'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-800'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${exportFormat === 'excel' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <FileSpreadsheet size={20} />
                    </div>
                    <div className="flex-1">
                      <span className="font-bold text-sm">Foglio Excel (.xlsx)</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Cartella di lavoro con fogli Matrice Consumi, Riepilogo Tipologie e Dettaglio Cronologico.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Tipologia Specific Selector for Export */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Tag size={14} className="text-gray-400" />
                  Tipologia da Esportare
                </label>
                <select
                  value={modalTipologia}
                  onChange={(e) => setModalTipologia(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 cursor-pointer text-sm"
                >
                  <option value="Tutte">Tutte le Tipologie Movimentate</option>
                  {availableTipologie.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Puoi estrarre solo una determinata tipologia di biancheria o tutte.
                </p>
              </div>

              {/* Filter Recap Box */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-1.5">
                <div className="flex justify-between items-center text-gray-700">
                  <span className="font-bold text-gray-500">Proprietà:</span>
                  <span className="font-semibold">{selectedProperty}</span>
                </div>
                {selectedApartment !== 'Tutti' && (
                  <div className="flex justify-between items-center text-gray-700">
                    <span className="font-bold text-gray-500">Alloggio:</span>
                    <span className="font-semibold">{selectedApartment}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-gray-700">
                  <span className="font-bold text-gray-500">Periodo:</span>
                  <span className="font-semibold">
                    {(startDate || endDate) 
                      ? `Dal ${formatDateDMY(startDate) || 'Inizio'} Al ${formatDateDMY(endDate) || 'Oggi'}` 
                      : 'Tutto lo storico'}
                  </span>
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 px-6 pb-6">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={executeExportFromModal}
                  disabled={isExporting}
                  className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <FileDown size={16} />}
                  <span>Scarica Documento</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
