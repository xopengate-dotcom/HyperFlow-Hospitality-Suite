import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction } from '../types';
import { getTransactions, getItems } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { RefreshCw, AlertCircle, Calendar, Download, FileText, Table, ChevronDown, ChevronRight, Sigma, Settings2 } from 'lucide-react';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAuthContext } from './Auth';
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Cell, Tooltip as RechartsTooltip, LabelList } from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6'];

interface ItemDetail {
  name: string;
  category: string;
  inQty: number;
  inCost: number;
  outQty: number;
  outCost: number;
  outByProperty: Record<string, number>;
  costByProperty: Record<string, number>;
  outByApartment: Record<string, number>;
  costByApartment: Record<string, number>;
}

interface MonthlyData {
  monthStr: string; // YYYY-MM
  label: string; // Mese Anno
  outByProperty: Record<string, number>;
  costByProperty: Record<string, number>;
  outByApartment: Record<string, number>;
  costByApartment: Record<string, number>;
  totalIn: number;
  totalOut: number;
  totalCostIn: number;
  totalCostOut: number;
  items: Record<string, ItemDetail>;
}

export function Reports() {
  const { settings, loading: settingsLoading } = useSettings();
  const { properties: PROPERTIES, apartments: APARTMENTS, propertyApartments: PROPERTY_APARTMENTS, apartmentProperty: APARTMENT_PROPERTY } = settings;
  const [loading, setLoading] = useState(true);
  const [chartsReady, setChartsReady] = useState(false);
  const [error, setError] = useState('');
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allItemsMap, setAllItemsMap] = useState<Record<string, { category: string }>>({});
  
  // Date filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedProperty, setSelectedProperty] = useState<string>('Tutte'); // 'Tutte' or specific property name
  const [selectedApartment, setSelectedApartment] = useState<string>('Tutti'); // 'Tutti' or specific apartment name

  // UI state for expanding/collapsing month details
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const { user } = useAuthContext();
  const STORAGE_KEY = `exportPrefs_${user?.uid}`;
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportColumns, setExportColumns] = useState({
    loads: true,
    loadsCost: true,
    consumption: true,
    consumptionCost: true,
    breakdown: true, // consumi per proprietà
    breakdownCost: true,
    breakdownApartments: false, // esplodi gli appartamenti della singola proprietà
    breakdownApartmentsCost: false // costo per appartamento // costo per appartamento
  });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved) {
      try { setExportColumns(prev => ({...prev, ...JSON.parse(saved)})) } catch(e){}
    }
  }, [STORAGE_KEY]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    if (exportMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const toggleColumn = (key: keyof typeof exportColumns) => {
    const next = {...exportColumns, [key]: !exportColumns[key]};
    setExportColumns(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleMonth = (monthStr: string) => {
    setExpandedMonths(prev => ({...prev, [monthStr]: !prev[monthStr]}));
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [txs, items] = await Promise.all([getTransactions(), getItems()]);
        setAllTransactions(txs);
        
        const map: Record<string, any> = {};
        items.forEach(i => map[i.id] = i);
        setAllItemsMap(map);
        
        setError('');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
        setTimeout(() => setChartsReady(true), 20);
      }
    }
    load();
  }, []);

  const handleSelectApartment = (ap: string) => {
    setSelectedApartment(ap);
    if (ap !== 'Tutti') {
      const prop = APARTMENT_PROPERTY[ap];
      if (prop && prop !== selectedProperty) {
        setSelectedProperty(prop);
      }
    }
  };

  const handleSelectProperty = (prop: string) => {
    setSelectedProperty(prop);
    setSelectedApartment('Tutti');
  };

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      let keep = true;
      if (startDate) {
        keep = keep && isAfter(t.date, startOfDay(new Date(startDate)));
      }
      if (endDate) {
        keep = keep && isBefore(t.date, endOfDay(new Date(endDate)));
      }
      if (selectedProperty !== 'Tutte') {
        keep = keep && (t.property || APARTMENT_PROPERTY[t.apartment || ''] || PROPERTIES[0]) === selectedProperty;
      }
      if (selectedApartment !== 'Tutti') {
        keep = keep && t.apartment === selectedApartment;
      }
      return keep;
    });
  }, [allTransactions, startDate, endDate, selectedProperty, selectedApartment]);

  const visibleProperties = useMemo(() => {
    if (selectedProperty !== 'Tutte') return [selectedProperty];
    return PROPERTIES;
  }, [selectedProperty]);

  const reportData = useMemo(() => {
    const grouped: Record<string, MonthlyData> = {};

    filteredTransactions.forEach(t => {
      const monthStr = format(t.date, 'yyyy-MM');
      if (!grouped[monthStr]) {
        grouped[monthStr] = {
          monthStr,
          label: format(t.date, 'MMMM yyyy', { locale: it }),
          outByProperty: {},
          costByProperty: {},
          outByApartment: {},
          costByApartment: {},
          totalIn: 0,
          totalOut: 0,
          totalCostIn: 0,
          totalCostOut: 0,
          items: {}
        };
      }
      
      const px = t.pricePerUnit || 0;
      const cost = t.quantity * px;
      
      const itemKey = `${t.itemId}-${t.itemName}`;
      if (!grouped[monthStr].items[itemKey]) {
        grouped[monthStr].items[itemKey] = {
          name: t.itemName,
          category: allItemsMap[t.itemId]?.category || 'Altro / Eliminato',
          inQty: 0,
          inCost: 0,
          outQty: 0,
          outCost: 0,
          outByProperty: {},
          costByProperty: {},
          outByApartment: {},
          costByApartment: {}
        };
      }
      const itemDetail = grouped[monthStr].items[itemKey];

      if (t.type === 'in') {
        grouped[monthStr].totalIn += t.quantity;
        grouped[monthStr].totalCostIn += cost;
        itemDetail.inQty += t.quantity;
        itemDetail.inCost += cost;
      } else {
        grouped[monthStr].totalOut += t.quantity;
        grouped[monthStr].totalCostOut += cost;
        itemDetail.outQty += t.quantity;
        itemDetail.outCost += cost;
        // Prop breakdown
        const objProp = t.property || APARTMENT_PROPERTY[t.apartment || ''] || PROPERTIES[0] || 'Sconosciuta';
        grouped[monthStr].outByProperty[objProp] = (grouped[monthStr].outByProperty[objProp] || 0) + t.quantity;
        grouped[monthStr].costByProperty[objProp] = (grouped[monthStr].costByProperty[objProp] || 0) + cost;
        
        itemDetail.outByProperty[objProp] = (itemDetail.outByProperty[objProp] || 0) + t.quantity;
        itemDetail.costByProperty[objProp] = (itemDetail.costByProperty[objProp] || 0) + cost;

        if (t.apartment) {
          grouped[monthStr].outByApartment[t.apartment] = (grouped[monthStr].outByApartment[t.apartment] || 0) + t.quantity;
          grouped[monthStr].costByApartment[t.apartment] = (grouped[monthStr].costByApartment[t.apartment] || 0) + cost;
          itemDetail.outByApartment[t.apartment] = (itemDetail.outByApartment[t.apartment] || 0) + t.quantity;
          itemDetail.costByApartment[t.apartment] = (itemDetail.costByApartment[t.apartment] || 0) + cost;
        }
      }
    });

    return Object.values(grouped).sort((a, b) => a.monthStr.localeCompare(b.monthStr));
  }, [filteredTransactions, allItemsMap]);

  const periodTotals = useMemo(() => {
    const totals = {
      totalIn: 0,
      totalCostIn: 0,
      totalOut: 0,
      totalCostOut: 0,
      outByProperty: {} as Record<string, number>,
      costByProperty: {} as Record<string, number>,
      outByApartment: {} as Record<string, number>,
      costByApartment: {} as Record<string, number>
    };

    reportData.forEach(month => {
      totals.totalIn += month.totalIn;
      totals.totalCostIn += month.totalCostIn;
      totals.totalOut += month.totalOut;
      totals.totalCostOut += month.totalCostOut;
      
      visibleProperties.forEach(ap => {
        totals.outByProperty[ap] = (totals.outByProperty[ap] || 0) + (month.outByProperty[ap] || 0);
        totals.costByProperty[ap] = (totals.costByProperty[ap] || 0) + (month.costByProperty[ap] || 0);
      });
      Object.keys(month.outByApartment).forEach(ap => {
        totals.outByApartment[ap] = (totals.outByApartment[ap] || 0) + (month.outByApartment[ap] || 0);
        totals.costByApartment[ap] = (totals.costByApartment[ap] || 0) + (month.costByApartment[ap] || 0);
      });
    });

    return totals;
  }, [reportData]);

  const exportPDF = () => {
    const doc = new jsPDF();
    let currentY = 15;
    doc.text("Report Magazzino B&B - Riepilogo", 14, currentY);
    
    // 1. RIEPILOGO
    const summaryData = reportData.map(data => {
      const row = [data.label];
      if (exportColumns.loads) row.push(data.totalIn.toString());
      if (exportColumns.loadsCost) row.push("€" + data.totalCostIn.toFixed(2));
      if (exportColumns.consumption) row.push(data.totalOut.toString());
      if (exportColumns.consumptionCost) row.push("€" + data.totalCostOut.toFixed(2));
      if (exportColumns.breakdown) {
        visibleProperties.forEach(ap => {
          row.push((data.outByProperty[ap] || 0).toString());
          if (exportColumns.breakdownCost) row.push("€" + (data.costByProperty[ap] || 0).toFixed(2));
          if (exportColumns.breakdownApartments) {
            (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
               row.push((data.outByApartment[subAp] || 0).toString());
               if (exportColumns.breakdownApartmentsCost) row.push("€" + (data.costByApartment[subAp] || 0).toFixed(2));
            });
          }
        });
      }
      return row;
    });

    const totalsRowPdf = ["TOTALE PERIODO"];
    if (exportColumns.loads) totalsRowPdf.push(periodTotals.totalIn.toString());
    if (exportColumns.loadsCost) totalsRowPdf.push("€" + periodTotals.totalCostIn.toFixed(2));
    if (exportColumns.consumption) totalsRowPdf.push(periodTotals.totalOut.toString());
    if (exportColumns.consumptionCost) totalsRowPdf.push("€" + periodTotals.totalCostOut.toFixed(2));
    if (exportColumns.breakdown) {
      visibleProperties.forEach(ap => {
        totalsRowPdf.push((periodTotals.outByProperty[ap] || 0).toString());
        if (exportColumns.breakdownCost) totalsRowPdf.push("€" + (periodTotals.costByProperty[ap] || 0).toFixed(2));
        if (exportColumns.breakdownApartments) {
          (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
            totalsRowPdf.push((periodTotals.outByApartment[subAp] || 0).toString());
            if (exportColumns.breakdownApartmentsCost) totalsRowPdf.push("€" + (periodTotals.costByApartment[subAp] || 0).toFixed(2));
          });
        }
      });
    }
    summaryData.push(totalsRowPdf);

    const headers = ["Mese"];
    if (exportColumns.loads) headers.push("Tot Car.");
    if (exportColumns.loadsCost) headers.push("Costo Car.");
    if (exportColumns.consumption) headers.push("Tot Cons.");
    if (exportColumns.consumptionCost) headers.push("Costo Cons.");
    if (exportColumns.breakdown) {
      visibleProperties.forEach(ap => {
        headers.push(ap);
        if (exportColumns.breakdownCost) headers.push(`Costo ${ap}`);
        if (exportColumns.breakdownApartments) {
          (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
            headers.push(subAp);
            if (exportColumns.breakdownApartmentsCost) headers.push(`Costo ${subAp}`);
          });
        }
      });
    }

    autoTable(doc, {
      startY: currentY + 10,
      head: [headers],
      body: summaryData,
      theme: 'grid',
      styles: { fontSize: 8, overflow: 'linebreak', cellPadding: 1 },
        columnStyles: { 0: { cellWidth: 20 } },
      headStyles: { fillColor: [41, 128, 185] },
      didParseCell: function(data) {
        if (data.row.section === 'body' && data.row.index === summaryData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [226, 232, 240];
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;

    // 2. DETTAGLIO PER MESE E PER ARTICOLO
    reportData.forEach(data => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 15;
      }
      doc.text(`Dettaglio Articoli - ${data.label}`, 14, currentY);
      
      const detailHeaders = ["Articolo", "Categoria"];
      if (exportColumns.loads) detailHeaders.push("Car.");
      if (exportColumns.loadsCost) detailHeaders.push("€ C.");
      if (exportColumns.consumption) detailHeaders.push("Cons.");
      if (exportColumns.consumptionCost) detailHeaders.push("€ Co.");
      if (exportColumns.breakdown) {
        visibleProperties.forEach(ap => {
          detailHeaders.push(ap);
          if (exportColumns.breakdownCost) detailHeaders.push(`€ ${ap}`);
          if (exportColumns.breakdownApartments) {
            (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
              detailHeaders.push(subAp);
              if (exportColumns.breakdownApartmentsCost) detailHeaders.push(`€ ${subAp}`);
            });
          }
        });
      }
      
      const detailBody = Object.values(data.items).sort((a: ItemDetail, b: ItemDetail) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')).map((item: ItemDetail) => {
         const row = [item.name, item.category];
         if (exportColumns.loads) row.push(item.inQty.toString());
         if (exportColumns.loadsCost) row.push(item.inCost.toFixed(2));
         if (exportColumns.consumption) row.push(item.outQty.toString());
         if (exportColumns.consumptionCost) row.push(item.outCost.toFixed(2));
         if (exportColumns.breakdown) {
           visibleProperties.forEach(ap => {
             row.push((item.outByProperty[ap] || 0).toString());
             if (exportColumns.breakdownCost) row.push((item.costByProperty[ap] || 0).toFixed(2));
             if (exportColumns.breakdownApartments) {
               (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
                  row.push((item.outByApartment[subAp] || 0).toString());
                  if (exportColumns.breakdownApartmentsCost) row.push((item.costByApartment[subAp] || 0).toFixed(2));
               });
             }
           });
         }
         return row;
      });

      const detailTotalsRow = ["TOTALE MESE", "-"];
      if (exportColumns.loads) detailTotalsRow.push(data.totalIn.toString());
      if (exportColumns.loadsCost) detailTotalsRow.push(data.totalCostIn.toFixed(2));
      if (exportColumns.consumption) detailTotalsRow.push(data.totalOut.toString());
      if (exportColumns.consumptionCost) detailTotalsRow.push(data.totalCostOut.toFixed(2));
      if (exportColumns.breakdown) {
        visibleProperties.forEach(ap => {
          detailTotalsRow.push((data.outByProperty[ap] || 0).toString());
          if (exportColumns.breakdownCost) detailTotalsRow.push((data.costByProperty[ap] || 0).toFixed(2));
          if (exportColumns.breakdownApartments) {
            (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
              detailTotalsRow.push((data.outByApartment[subAp] || 0).toString());
              if (exportColumns.breakdownApartmentsCost) detailTotalsRow.push((data.costByApartment[subAp] || 0).toFixed(2));
            });
          }
        });
      }
      detailBody.push(detailTotalsRow);

      autoTable(doc, {
        startY: currentY + 10,
        head: [detailHeaders],
        body: detailBody,
        theme: 'striped',
        styles: { fontSize: 7, overflow: 'linebreak', cellPadding: 1 },
        columnStyles: {
          0: { cellWidth: 35 }, // Articolo
          1: { cellWidth: 20 }  // Categoria
        },
        headStyles: { fillColor: [100, 116, 139] },
        didParseCell: function(cellData) {
          if (cellData.row.section === 'body' && cellData.row.index === detailBody.length - 1) {
            cellData.cell.styles.fontStyle = 'bold';
            cellData.cell.styles.fillColor = [226, 232, 240];
          }
        }
      });
      currentY = (doc as any).lastAutoTable.finalY + 20;
    });

    doc.save(`report_magazzino_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const exportExcel = () => {
    // Foglio 1: Riepilogo Mensile
    const summaryExportData = reportData.map(data => {
      const row: Record<string, any> = { "Mese": data.label };
      if (exportColumns.loads) row["Totale Carichi (Unità)"] = data.totalIn;
      if (exportColumns.loadsCost) row["Costo Carichi (€)"] = data.totalCostIn;
      if (exportColumns.consumption) row["Totale Consumi (Unità)"] = data.totalOut;
      if (exportColumns.consumptionCost) row["Costo Consumi (€)"] = data.totalCostOut;
      if (exportColumns.breakdown) {
        visibleProperties.forEach(ap => {
          row[`Consumi ${ap} (Unità)`] = data.outByProperty[ap] || 0;
          if (exportColumns.breakdownCost) row[`Costo ${ap} (€)`] = data.costByProperty[ap] || 0;
          if (exportColumns.breakdownApartments) {
            (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
              row[`Consumi ${subAp} (Unità)`] = data.outByApartment[subAp] || 0;
              if (exportColumns.breakdownApartmentsCost) row[`Costo ${subAp} (€)`] = data.costByApartment[subAp] || 0;
            });
          }
        });
      }
      return row;
    });

    // Add empty row and Totals row
    summaryExportData.push({});
    
    const totalsRowExcel: Record<string, any> = { "Mese": "TOTALE PERIODO" };
    if (exportColumns.loads) totalsRowExcel["Totale Carichi (Unità)"] = periodTotals.totalIn;
    if (exportColumns.loadsCost) totalsRowExcel["Costo Carichi (€)"] = periodTotals.totalCostIn;
    if (exportColumns.consumption) totalsRowExcel["Totale Consumi (Unità)"] = periodTotals.totalOut;
    if (exportColumns.consumptionCost) totalsRowExcel["Costo Consumi (€)"] = periodTotals.totalCostOut;
    if (exportColumns.breakdown) {
      visibleProperties.forEach(ap => {
        totalsRowExcel[`Consumi ${ap} (Unità)`] = periodTotals.outByProperty[ap] || 0;
        if (exportColumns.breakdownCost) totalsRowExcel[`Costo ${ap} (€)`] = periodTotals.costByProperty[ap] || 0;
        if (exportColumns.breakdownApartments) {
          (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
            totalsRowExcel[`Consumi ${subAp} (Unità)`] = periodTotals.outByApartment[subAp] || 0;
            if (exportColumns.breakdownApartmentsCost) totalsRowExcel[`Costo ${subAp} (€)`] = periodTotals.costByApartment[subAp] || 0;
          });
        }
      });
    }
    summaryExportData.push(totalsRowExcel);

    const summaryWs = XLSX.utils.json_to_sheet(summaryExportData);

    // Foglio 2: Dettaglio Articoli
    const detailExportData: any[] = [];
    reportData.forEach(data => {
      Object.values(data.items).sort((a: ItemDetail, b: ItemDetail) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')).forEach((item: ItemDetail) => {
        const row: any = { "Mese": data.label, "Articolo": item.name, "Categoria": item.category };
        if (exportColumns.loads) row["Carichi (Q.tà)"] = item.inQty;
        if (exportColumns.loadsCost) row["Carichi (€)"] = item.inCost;
        if (exportColumns.consumption) row["Consumi (Q.tà)"] = item.outQty;
        if (exportColumns.consumptionCost) row["Consumi (€)"] = item.outCost;
        if (exportColumns.breakdown) {
          visibleProperties.forEach(ap => {
             row[`${ap} (Q.tà)`] = item.outByProperty[ap] || 0;
             if (exportColumns.breakdownCost) row[`Costo ${ap} (€)`] = item.costByProperty[ap] || 0;
             if (exportColumns.breakdownApartments) {
               (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
                  row[`${subAp} (Q.tà)`] = item.outByApartment[subAp] || 0;
                  if (exportColumns.breakdownApartmentsCost) row[`Costo ${subAp} (€)`] = item.costByApartment[subAp] || 0;
               });
             }
          });
        }
        detailExportData.push(row);
      });
      
      const detailTotalsRow: Record<string, any> = { "Mese": data.label, "Articolo": "TOTALE MESE", "Categoria": "-" };
      if (exportColumns.loads) detailTotalsRow["Carichi (Q.tà)"] = data.totalIn;
      if (exportColumns.loadsCost) detailTotalsRow["Carichi (€)"] = data.totalCostIn;
      if (exportColumns.consumption) detailTotalsRow["Consumi (Q.tà)"] = data.totalOut;
      if (exportColumns.consumptionCost) detailTotalsRow["Consumi (€)"] = data.totalCostOut;
      if (exportColumns.breakdown) {
        visibleProperties.forEach(ap => {
           detailTotalsRow[`${ap} (Q.tà)`] = data.outByProperty[ap] || 0;
           if (exportColumns.breakdownCost) detailTotalsRow[`Costo ${ap} (€)`] = data.costByProperty[ap] || 0;
           if (exportColumns.breakdownApartments) {
             (PROPERTY_APARTMENTS[ap] || []).forEach(subAp => {
                detailTotalsRow[`${subAp} (Q.tà)`] = data.outByApartment[subAp] || 0;
                if (exportColumns.breakdownApartmentsCost) detailTotalsRow[`Costo ${subAp} (€)`] = data.costByApartment[subAp] || 0;
             });
           }
        });
      }
      detailExportData.push(detailTotalsRow);
      detailExportData.push({});
    });
    const detailWs = XLSX.utils.json_to_sheet(detailExportData);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summaryWs, "Riepilogo Mensile");
    XLSX.utils.book_append_sheet(workbook, detailWs, "Dettaglio Articoli");
    XLSX.writeFile(workbook, `report_magazzino_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  if (loading || settingsLoading) {
    return <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Report Dettagliati</h2>
          <p className="text-sm text-gray-500">Analisi completa dei costi e logistica</p>
        </div>
        <div className="flex items-center gap-2 relative" ref={menuRef}>
          <button 
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
            className="flex items-center justify-center px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition shadow-sm"
            title="Opzioni Esportazione"
          >
            <Settings2 size={18} className="text-gray-500" /><span className="hidden sm:inline font-semibold text-gray-700 ml-1">Opzioni Export</span>
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-12 mt-1 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden origin-top-right">
              <div className="p-3 border-b border-gray-50 bg-gray-50/50">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">Dati da Esportare</span>
              </div>
              <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                  <input type="checkbox" checked={exportColumns.loads} onChange={() => toggleColumn('loads')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                  <span className="text-sm text-gray-700 font-medium">Carichi (Semplice)</span>
                </label>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                  <input type="checkbox" checked={exportColumns.loadsCost} onChange={() => toggleColumn('loadsCost')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                  <span className="text-sm text-gray-700 font-medium">Costi Carichi (€)</span>
                </label>
                <div className="h-px bg-gray-100 my-1"></div>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                  <input type="checkbox" checked={exportColumns.consumption} onChange={() => toggleColumn('consumption')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                  <span className="text-sm text-gray-700 font-medium">Consumi Generali</span>
                </label>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                  <input type="checkbox" checked={exportColumns.consumptionCost} onChange={() => toggleColumn('consumptionCost')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                  <span className="text-sm text-gray-700 font-medium">Costi Consumi (€)</span>
                </label>
                <div className="h-px bg-gray-100 my-1"></div>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                  <input type="checkbox" checked={exportColumns.breakdown} onChange={() => toggleColumn('breakdown')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                  <span className="text-sm text-gray-700 font-medium">Spaccato x Proprietà</span>
                </label>
                {exportColumns.breakdown && (
                  <>
                    <label className="flex items-center gap-2 pl-6 pr-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                      <input type="checkbox" checked={exportColumns.breakdownCost} onChange={() => toggleColumn('breakdownCost')} className="rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                      <span className="text-xs text-gray-600 font-medium">Includi Costi in € x Proprietà</span>
                    </label>
                    <label className="flex items-center gap-2 pl-6 pr-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                      <input type="checkbox" checked={exportColumns.breakdownApartments} onChange={() => toggleColumn('breakdownApartments')} className="rounded text-purple-600 focus:ring-purple-500 border-gray-300" />
                      <span className="text-xs text-purple-700 font-medium">Esplodi anche i singoli Appartamenti</span>
                    </label>
                    {exportColumns.breakdownApartments && (
                      <label className="flex items-center gap-2 pl-10 pr-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                        <input type="checkbox" checked={exportColumns.breakdownApartmentsCost} onChange={() => toggleColumn('breakdownApartmentsCost')} className="rounded text-purple-600 focus:ring-purple-500 border-gray-300" />
                        <span className="text-xs text-purple-600 font-medium">Includi Costi in € x Appartamento</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition shadow-sm"
            title="Esporta in PDF"
          >
            <FileText size={18} className="text-red-500" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button 
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition shadow-sm"
            title="Esporta in Excel"
          >
            <Table size={18} className="text-emerald-600" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-200 flex flex-wrap gap-4 items-end shadow-xs">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Dalla data</label>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Alla data</label>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Proprietà</label>
          <select 
            value={selectedProperty}
            onChange={(e) => handleSelectProperty(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50"
          >
            <option value="Tutte">Tutte</option>
            {PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Appartamento</label>
          <select 
            value={selectedApartment}
            onChange={(e) => handleSelectApartment(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50"
          >
            <option value="Tutti">Tutti</option>
            {(selectedProperty === 'Tutte' ? APARTMENTS : PROPERTY_APARTMENTS[selectedProperty]).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {(startDate || endDate || selectedProperty !== 'Tutte' || selectedApartment !== 'Tutti') && (
          <button 
            onClick={() => { setStartDate(''); setEndDate(''); setSelectedProperty('Tutte'); setSelectedApartment('Tutti'); }}
            className="px-4 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-xl transition"
          >
            Pulisci filtri
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {reportData.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200">
           Nessun dato disponibile per il periodo selezionato.
        </div>
      ) : (
        <div className="space-y-6">
          {/* TOTALI DEL PERIODO WIDGET */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm overflow-hidden relative print:break-inside-avoid">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 text-gray-50">
              <Sigma size={160} />
            </div>
            <div className="relative z-10">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-900">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Sigma size={20}/></div> 
                Totali del Periodo Selezionato
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
                  <p className="text-blue-600 text-sm font-medium mb-1">Unità Caricate</p>
                  <p className="text-3xl font-bold text-blue-900">+{periodTotals.totalIn}</p>
                </div>
                <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
                  <p className="text-blue-600 text-sm font-medium mb-1">Costo Carichi</p>
                  <p className="text-3xl font-bold text-blue-900">€{periodTotals.totalCostIn.toFixed(2)}</p>
                </div>
                <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100">
                  <p className="text-amber-600 text-sm font-medium mb-1">Unità Consumate</p>
                  <p className="text-3xl font-bold text-amber-900">-{periodTotals.totalOut}</p>
                </div>
                <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100">
                  <p className="text-amber-600 text-sm font-medium mb-1">Costo Consumi</p>
                  <p className="text-3xl font-bold text-amber-900">€{periodTotals.totalCostOut.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleProperties.map(ap => (
                  <div key={ap} className="flex justify-between items-center bg-gray-50 rounded-xl p-3 px-4 border border-gray-100">
                    <span className="font-medium text-gray-700">{ap}</span>
                    <div className="text-right">
                      <span className="font-bold text-gray-900 mr-3">{periodTotals.outByProperty[ap] || 0} pz</span>
                      <span className="text-amber-600 font-medium">€{(periodTotals.costByProperty[ap] || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:break-inside-avoid">
            {!chartsReady ? (
              <div className="lg:col-span-2 h-72 flex items-center justify-center bg-white rounded-3xl border border-gray-200">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
              </div>
            ) : (
              <>
                {/* Grafico a Barre - Consumi Mensili per Appartamento */}
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm animate-in fade-in duration-500">
                  <h3 className="font-bold text-gray-900 mb-6 text-sm">Consumi Mensili (Q.tà) per Appartamento</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          labelStyle={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        {visibleProperties.map((ap, idx) => (
                          <Bar key={ap} dataKey={`outByProperty.${ap}`} name={ap} fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]}>
                            <LabelList dataKey={`outByProperty.${ap}`} position="top" style={{ fontSize: '10px', fill: '#6b7280' }} formatter={(val: number) => val > 0 ? val : ''} />
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Grafico a Torta - Ripartizione Totale Periodo */}
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm animate-in fade-in duration-500">
                  <h3 className="font-bold text-gray-900 mb-6 text-sm">Ripartizione Totale Consumi (Periodo)</h3>
                  <div className="h-72 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={visibleProperties.map(ap => ({ name: ap, value: periodTotals.outByProperty[ap] || 0 })).filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                          label={({ name, value, percent }) => `${name} ${value} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                        >
                          {visibleProperties.map((ap, idx) => (
                            <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          formatter={(value: number) => [`${value} unità`, 'Quantità']}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Grafico a Linee - Andamento Costi Mensili */}
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm lg:col-span-2 animate-in fade-in duration-500">
                  <h3 className="font-bold text-gray-900 mb-6 text-sm">Andamento Costi Mensili per Appartamento (€)</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `€${val}`} />
                        <RechartsTooltip 
                          formatter={(value: number) => [`€${value.toFixed(2)}`, 'Costo']}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          labelStyle={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        {visibleProperties.map((ap, idx) => (
                          <Line key={ap} type="monotone" dataKey={`costByProperty.${ap}`} name={ap} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>

          {reportData.map(data => {
            const isExpanded = expandedMonths[data.monthStr];
            return (
              <div key={data.monthStr} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs print:break-inside-avoid">
                <div 
                  className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition"
                  onClick={() => toggleMonth(data.monthStr)}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="text-gray-400" size={20} />
                    <h3 className="font-bold text-gray-900 capitalize text-lg">{data.label}</h3>
                  </div>
                  <div className="text-gray-400">
                    {isExpanded ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
                  </div>
                </div>
                
                <div className="p-6">
                  {/* SUMMARY CARDS */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                      <p className="text-sm text-blue-800 font-medium mb-1">Totale Carichi</p>
                      <p className="text-2xl font-bold text-blue-900">+{data.totalIn}</p>
                      <p className="text-xs text-blue-700 mt-1 font-medium">Valore Merce: €{data.totalCostIn.toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100">
                      <p className="text-sm text-amber-800 font-medium mb-1">Totale Consumi</p>
                      <p className="text-2xl font-bold text-amber-900">-{data.totalOut}</p>
                      <p className="text-xs text-amber-700 mt-1 font-medium">Valore Cons.: €{data.totalCostOut.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* SUMMARY BARS */}
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 px-1">Ripartizione Costi/Unità</h4>
                  <div className="space-y-3 mb-8 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                    {visibleProperties.map(ap => {
                      const val = data.outByProperty[ap] || 0;
                      const cost = data.costByProperty[ap] || 0;
                      const percent = data.totalOut > 0 ? (val / data.totalOut) * 100 : 0;
                      return (
                        <div key={ap} className="relative">
                          <div className="flex justify-between text-sm mb-1 px-1">
                            <span className="font-medium text-gray-700">{ap}</span>
                            <span className="text-gray-900 font-medium">{val} pz <span className="text-gray-400 font-normal ml-2">/</span> <span className="text-amber-700 font-semibold ml-2">€{cost.toFixed(2)}</span></span>
                          </div>
                          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-500 rounded-full" 
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* DETAILS (EXPANDABLE) */}
                  {isExpanded && (
                    <div className="mt-4 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-top-4">
                      <h4 className="text-sm font-bold text-gray-900 mb-4 px-1 uppercase tracking-wider">Dettaglio Articoli</h4>
                      <div className="overflow-x-auto border border-gray-200 rounded-xl w-full">
                        <table className="w-full text-left text-xs table-fixed">
                          <thead className="bg-gray-100 text-gray-600 font-medium border-b border-gray-200 text-[9px] sm:text-[10px] uppercase tracking-wider">
                            <tr>
                              <th className="p-1 sm:p-2 w-32 sm:w-48 font-semibold">Articolo</th>
                              <th className="p-1 sm:p-2 w-12 sm:w-20 text-right font-semibold">In</th>
                              <th className="p-1 sm:p-2 w-12 sm:w-20 text-right font-semibold">Out</th>
                              {visibleProperties.map(ap => (
                                <React.Fragment key={ap}>
                                  <th className="p-1 sm:p-2 text-right font-semibold text-amber-900 bg-amber-50/50 truncate" title={ap}>{ap}</th>
                                  {exportColumns.breakdownApartments && (PROPERTY_APARTMENTS[ap] || []).map(subAp => (
                                    <th key={subAp} className="p-1 sm:p-2 text-right font-semibold text-purple-900 bg-purple-50/50 truncate" title={subAp}>{subAp}</th>
                                  ))}
                                </React.Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-[10px] sm:text-xs">
                            {Object.values(data.items).sort((a: ItemDetail, b: ItemDetail) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')).map((item: ItemDetail, idx) => (
                              <tr key={idx} className="hover:bg-blue-50/30 transition">
                                <td className="p-1 sm:p-2 font-medium text-gray-900 align-top">
                                  <div className="truncate mb-0.5" title={item.name}>{item.name}</div>
                                  <span className="inline-block px-1 sm:px-1.5 text-[8px] sm:text-[9px] font-medium bg-gray-200 text-gray-700 rounded py-0.5 truncate max-w-full">
                                    {item.category}
                                  </span>
                                </td>
                                <td className="p-1 sm:p-2 text-right align-top">
                                  {item.inQty > 0 ? (
                                    <span>
                                      <span className="text-blue-600 font-semibold">+{item.inQty}</span>
                                      <span className="text-[8px] sm:text-[10px] text-blue-800/60 block bg-blue-50 rounded px-1 w-fit ml-auto mt-0.5">€{item.inCost.toFixed(2)}</span>
                                    </span>
                                  ) : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="p-1 sm:p-2 text-right align-top">
                                  {item.outQty > 0 ? (
                                    <span>
                                      <span className="text-amber-600 font-semibold">-{item.outQty}</span>
                                      <span className="text-[8px] sm:text-[10px] text-amber-800/60 block bg-amber-50 rounded px-1 w-fit ml-auto mt-0.5">€{item.outCost.toFixed(2)}</span>
                                    </span>
                                  ) : <span className="text-gray-300">-</span>}
                                </td>
                                {visibleProperties.map(ap => (
                                  <React.Fragment key={ap}>
                                    <td className="p-1 sm:p-2 text-right text-gray-500 bg-amber-50/10 align-top">
                                      {item.outByProperty[ap] ? (
                                        <span>
                                          <span className="font-medium text-gray-800">{item.outByProperty[ap]}</span> 
                                          <span className="block text-[8px] sm:text-[10px] text-amber-700 font-medium">€{(item.costByProperty[ap] || 0).toFixed(2)}</span>
                                        </span>
                                      ) : <span className="text-gray-300">-</span>}
                                    </td>
                                    {exportColumns.breakdownApartments && (PROPERTY_APARTMENTS[ap] || []).map(subAp => (
                                      <td key={subAp} className="p-1 sm:p-2 text-right text-gray-500 bg-purple-50/10 align-top">
                                        {item.outByApartment[subAp] ? (
                                          <span>
                                            <span className="font-medium text-gray-800">{item.outByApartment[subAp]}</span> 
                                            <span className="block text-[8px] sm:text-[10px] text-purple-700 font-medium">€{(item.costByApartment[subAp] || 0).toFixed(2)}</span>
                                          </span>
                                        ) : <span className="text-gray-300">-</span>}
                                      </td>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-[10px] sm:text-xs">
                            <tr>
                              <td className="p-1 sm:p-2 font-bold text-gray-900 text-right uppercase text-[9px] sm:text-[10px] tracking-wider">Totale:</td>
                              <td className="p-1 sm:p-2 text-right">
                                {data.totalIn > 0 ? (
                                  <span>
                                    <span className="text-blue-700 font-bold">+{data.totalIn}</span>
                                    <span className="text-[8px] sm:text-[10px] text-blue-800/80 block bg-blue-100 rounded px-1 min-w-[24px] sm:px-1.5 py-0.5 w-fit ml-auto mt-0.5 font-semibold">€{data.totalCostIn.toFixed(2)}</span>
                                  </span>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-1 sm:p-2 text-right">
                                {data.totalOut > 0 ? (
                                  <span>
                                    <span className="text-amber-700 font-bold">-{data.totalOut}</span>
                                    <span className="text-[8px] sm:text-[10px] text-amber-800/80 block bg-amber-100 rounded px-1 min-w-[24px] sm:px-1.5 py-0.5 w-fit ml-auto mt-0.5 font-semibold">€{data.totalCostOut.toFixed(2)}</span>
                                  </span>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                              {visibleProperties.map(ap => (
                                <React.Fragment key={ap}>
                                  <td className="p-1 sm:p-2 text-right text-gray-500 bg-amber-50/10">
                                    {data.outByProperty[ap] ? (
                                      <span>
                                        <span className="font-bold text-gray-900">{data.outByProperty[ap]}</span> 
                                        <span className="block text-[8px] sm:text-[10px] text-amber-800 font-bold">€{(data.costByProperty[ap] || 0).toFixed(2)}</span>
                                      </span>
                                    ) : <span className="text-gray-400">-</span>}
                                  </td>
                                  {exportColumns.breakdownApartments && (PROPERTY_APARTMENTS[ap] || []).map(subAp => (
                                    <td key={subAp} className="p-1 sm:p-2 text-right text-gray-500 bg-purple-50/10">
                                      {data.outByApartment[subAp] ? (
                                        <span>
                                          <span className="font-bold text-gray-900">{data.outByApartment[subAp]}</span> 
                                          <span className="block text-[8px] sm:text-[10px] text-purple-800 font-bold">€{(data.costByApartment[subAp] || 0).toFixed(2)}</span>
                                        </span>
                                      ) : <span className="text-gray-400">-</span>}
                                    </td>
                                  ))}
                                </React.Fragment>
                              ))}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {!isExpanded && (
                    <div className="mt-2 text-center">
                      <button onClick={() => toggleMonth(data.monthStr)} className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                        Vedi Analisi Dettagliata per Prodotto
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
