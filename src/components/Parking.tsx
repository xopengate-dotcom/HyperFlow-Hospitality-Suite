import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isWithinInterval, startOfMonth, endOfMonth, startOfDay, addMonths, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { ParkingReservation } from '../types';
import { getParkingReservations, addParkingReservation, updateParkingReservation, deleteParkingReservation } from '../firebase/api';
import { useSettings } from './SettingsProvider';
import { useAuthContext } from './Auth';
import { ChevronLeft, ChevronRight, Plus, X, AlertCircle, Edit2, Trash2, Calendar as CalendarIcon, Car, Bell, CheckCircle, FileText, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function Parking() {
  const { settings } = useSettings();
  const APARTMENTS = settings.apartments;
  const { isAdmin, permissions } = useAuthContext();
  const [reservations, setReservations] = useState<ParkingReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());

  const canView = isAdmin || permissions?.parking;
  const canEdit = isAdmin || permissions?.parkingEdit;

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const augmentedReservations = useMemo(() => reservations.map(r => {
    const prop = r.property || settings.apartmentProperty[r.apartment] || settings.properties[0] || '';
    return {
      ...r,
      property: prop,
      parkingSpot: r.parkingSpot || prop
    };
  }), [reservations, settings.apartmentProperty, settings.properties]);

  const tracksMap = useMemo(() => {
    const sorted = [...augmentedReservations].sort((a, b) => {
      if (!a.startDate || !b.startDate) return 0;
      return a.startDate.getTime() - b.startDate.getTime();
    });
    const tracks = new Map<string, number>();
    const trackEnds: number[] = [];

    sorted.forEach(res => {
      if (!res.startDate || !res.endDate) return;
      const activeStart = startOfDay(res.startDate).getTime();
      let activeEnd = startOfDay(res.endDate).getTime();
      
      if (!isSameDay(res.startDate, res.endDate)) {
         activeEnd = subDays(activeEnd, 1).getTime();
      }

      let placed = false;
      for (let i = 0; i < trackEnds.length; i++) {
        if (trackEnds[i] < activeStart) {
           tracks.set(res.id, i);
           trackEnds[i] = activeEnd;
           placed = true;
           break;
        }
      }
      if (!placed) {
        tracks.set(res.id, trackEnds.length);
        trackEnds.push(activeEnd);
      }
    });
    return tracks;
  }, [augmentedReservations]);

  const [formData, setFormData] = useState({
    property: settings.properties[0] || '',
    parkingSpot: '',
    apartment: '',
    guestName: '',
    licensePlate: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    notes: '',
    ztlCreated: false,
    ztlPdfBase64: '',
    cardDelivered: false
  });

  const [activeTab, setActiveTab] = useState<'calendar' | 'report'>('calendar');
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getParkingReservations();
      setReservations(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Errore durante il caricamento delle prenotazioni');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      loadData();
    }
  }, [canView]);

  useEffect(() => {
    const handleNetworkOnline = () => {
      if (canView) {
        loadData();
      }
    };
    window.addEventListener('app-network-online', handleNetworkOnline);
    return () => window.removeEventListener('app-network-online', handleNetworkOnline);
  }, [canView]);

  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const openAddModal = (date?: Date) => {
    const defaultProp = settings.properties[0] || '';
    const availableApts = settings.propertyApartments[defaultProp] || [];
    const defaultApt = availableApts[0] || APARTMENTS[0] || '';
    
    setFormData({
      property: defaultProp,
      parkingSpot: defaultProp,
      apartment: defaultApt,
      guestName: '',
      licensePlate: '',
      startDate: format(date || new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(date || new Date(), 1), 'yyyy-MM-dd'),
      notes: '',
      ztlCreated: false,
      ztlPdfBase64: '',
      cardDelivered: false
    });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (res: ParkingReservation) => {
    const prop = res.property || settings.apartmentProperty[res.apartment] || settings.properties[0] || '';
    setFormData({
      property: prop,
      parkingSpot: res.parkingSpot || prop,
      apartment: res.apartment,
      guestName: res.guestName,
      licensePlate: res.licensePlate || '',
      startDate: format(res.startDate, 'yyyy-MM-dd'),
      endDate: format(res.endDate, 'yyyy-MM-dd'),
      notes: res.notes || '',
      ztlCreated: res.ztlCreated || false,
      ztlPdfBase64: res.ztlPdfBase64 || '',
      cardDelivered: res.cardDelivered || false
    });
    setEditingId(res.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const start = new Date(formData.startDate + 'T12:00:00');
      const end = new Date(formData.endDate + 'T12:00:00');
      
      if (start > end) {
        setError('La data di fine non può essere precedente alla data di inizio');
        return;
      }
      
      // Controllo Sovrapposizioni Prenotazioni
      const hasOverlap = augmentedReservations.some(r => {
        if (editingId && r.id === editingId) return false;
        const spotR = r.property || r.parkingSpot;
        const spotNew = formData.property || formData.parkingSpot;
        if (spotR !== spotNew) return false;
        
        const rStart = r.startDate.getTime();
        const rEnd = r.endDate.getTime();
        const nStart = start.getTime();
        const nEnd = end.getTime();
        
        // Due prenotazioni sono in overlap se Start_A < End_B AND End_A > Start_B
        return (nStart < rEnd) && (nEnd > rStart);
      });

      if (hasOverlap) {
        setError(`Attenzione: Il posto auto / proprietario ${formData.property || formData.parkingSpot} è già occupato per le date selezionate.`);
        setIsSubmitting(false);
        return;
      }

      if (editingId) {
        await updateParkingReservation(editingId, {
          ...formData,
          startDate: start,
          endDate: end
        });
      } else {
        await addParkingReservation({
          ...formData,
          startDate: start,
          endDate: end
        });
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Errore durante il salvataggio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit || !window.confirm('Sei sicuro di voler eliminare questa prenotazione?')) return;
    try {
      await deleteParkingReservation(id);
      loadData();
    } catch (err: any) {
      setError(err.message || "Errore durante l'eliminazione");
    }
  };

  const getReservationsForDay = (date: Date) => {
    return augmentedReservations.filter(res => {
      try {
        const checkDate = startOfDay(date);
        const resStart = startOfDay(res.startDate);
        const resEnd = startOfDay(res.endDate);
        
        if (isSameDay(resStart, resEnd)) {
          return isSameDay(checkDate, resStart);
        }
        
        // Return true if checkDate >= resStart AND checkDate < resEnd
        return checkDate.getTime() >= resStart.getTime() && checkDate.getTime() < resEnd.getTime();
      } catch (e) {
        return false;
      }
    });
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Accesso Negato</h2>
        <p className="text-gray-500 text-center max-w-md">
          Non hai i permessi necessari per visualizzare il calendario del posto auto.
        </p>
      </div>
    );
  }

  const upcomingReservations = augmentedReservations.filter(r => {
    try {
      return r.endDate && r.startDate && r.endDate >= startOfDay(new Date());
    } catch(e) {
      return false;
    }
  }).sort((a,b) => {
    try {
      return a.startDate.getTime() - b.startDate.getTime();
    } catch(e) {
      return 0;
    }
  });

  const getColorsForProperty = (propName: string) => {
    const idx = settings.properties.indexOf(propName);
    if (idx === 1 || propName.toLowerCase().includes('ghislotti')) {
      return { bg: 'bg-purple-50', hover: 'hover:bg-purple-100', border: 'border-purple-200', text: 'text-purple-700', textSub: 'text-purple-600/80', pill: 'bg-purple-50 text-purple-700 border-purple-100' };
    } else if (idx === 0 || propName.toLowerCase().includes('missale')) {
      return { bg: 'bg-red-50', hover: 'hover:bg-red-100', border: 'border-red-200', text: 'text-red-700', textSub: 'text-red-600/80', pill: 'bg-red-50 text-red-700 border-red-100' };
    } else if (idx === 2) {
      return { bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', textSub: 'text-emerald-600/80', pill: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    // Default blue
    return { bg: 'bg-blue-50', hover: 'hover:bg-blue-100', border: 'border-blue-200', text: 'text-blue-700', textSub: 'text-blue-600/80', pill: 'bg-blue-50 text-blue-700 border-blue-100' };
  };

  const safeFormat = (date: Date | any, formatStr: string, options?: any) => {
    try {
      if (!date || isNaN(new Date(date).getTime())) return 'Data invalida';
      return format(date, formatStr, options);
    } catch (e) {
      return 'Data invalida';
    }
  };

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const incomingToday = augmentedReservations.filter(r => {
    try { return isSameDay(today, startOfDay(r.startDate)); } catch(e) { return false; }
  });
  const outgoingToday = augmentedReservations.filter(r => {
    try { return isSameDay(today, startOfDay(r.endDate)); } catch(e) { return false; }
  });
  const incomingTomorrow = augmentedReservations.filter(r => {
    try { return isSameDay(tomorrow, startOfDay(r.startDate)); } catch(e) { return false; }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Car className="text-blue-600" size={28} />
            Gestione Posto Auto
          </h1>
          <p className="text-gray-500 mt-1">
            Monitoraggio disponibilità e prenotazioni ZTL
          </p>
        </div>
        
        {canEdit && (
          <button
            onClick={() => openAddModal()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium shadow-sm"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nuova Prenotazione</span>
          </button>
        )}
      </div>

      <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto self-start">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
            activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <CalendarIcon size={18} />
            Calendario
          </div>
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
            activeTab === 'report' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <FileText size={18} />
            Report Mensile
          </div>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {activeTab === 'report' ? (
         <ParkingReport 
           reservations={augmentedReservations} 
           reportYear={reportYear} 
           setReportYear={setReportYear} 
           apartments={APARTMENTS}
           onRefresh={loadData}
           isLoading={loading}
         />
      ) : (
        <>
          {(incomingToday.length > 0 || outgoingToday.length > 0 || incomingTomorrow.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm">
          <h3 className="text-amber-900 font-black flex items-center gap-2 mb-4 text-sm sm:text-base tracking-tight">
            <Bell size={20} className="text-amber-600 animate-pulse" />
            Promemoria Operativi Parcheggio
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {incomingToday.map(r => (
               <div key={`in-tdy-${r.id}`} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col gap-2">
                 <div className="flex items-center gap-3">
                   <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-black text-xs uppercase tracking-wider">In Arrivo Oggi</div>
                   <p className="font-black text-gray-900 leading-tight flex-1 line-clamp-1">
                     <span className={`text-[10px] mr-1.5 px-1.5 py-0.5 rounded border ${getColorsForProperty(r.property || r.parkingSpot || '').pill}`}>{r.property || r.parkingSpot}</span>
                     {r.apartment}
                   </p>
                 </div>
                 <div className="text-sm">
                   <p className="font-semibold text-gray-800">{r.guestName} <span className="text-gray-500 font-normal">({r.licensePlate || 'Targa Mnc.'})</span></p>
                 </div>
                 <div className={`p-2 rounded-lg border mt-1 ${r.cardDelivered ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-700'}`}>
                   <p className="text-xs font-medium flex items-center gap-1.5">
                     {r.cardDelivered ? (
                       <><CheckCircle size={14} className="text-emerald-500" /> Tessera in casa</>
                     ) : (
                       <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span> Lasciare la tessera in casa.</>
                     )}
                   </p>
                 </div>
                 {!r.ztlCreated && (
                   <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                     <AlertTriangle size={14} /> Permesso ZTL NON Creato!
                   </div>
                 )}
               </div>
            ))}
            {outgoingToday.map(r => (
               <div key={`out-tdy-${r.id}`} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col gap-2">
                 <div className="flex items-center gap-3">
                   <div className="bg-rose-100 text-rose-700 px-2 py-1 rounded font-black text-xs uppercase tracking-wider">In Partenza Oggi</div>
                   <p className="font-black text-gray-900 leading-tight flex-1 line-clamp-1">
                     <span className={`text-[10px] mr-1.5 px-1.5 py-0.5 rounded border ${getColorsForProperty(r.property || r.parkingSpot || '').pill}`}>{r.property || r.parkingSpot}</span>
                     {r.apartment}
                   </p>
                 </div>
                 <div className="text-sm">
                   <p className="font-semibold text-gray-800">{r.guestName}</p>
                 </div>
                 <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 mt-1">
                   <p className="text-xs text-gray-700 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 block"></span> Ritirare la tessera.</p>
                 </div>
               </div>
            ))}
            {incomingTomorrow.map(r => (
               <div key={`in-tmrw-${r.id}`} className="bg-white/90 p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2 opacity-80">
                 <div className="flex items-center gap-3">
                   <div className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-black text-xs uppercase tracking-wider">Arrivo Domani</div>
                   <p className="font-black text-gray-900 leading-tight flex-1 line-clamp-1">
                     <span className={`text-[10px] mr-1.5 px-1.5 py-0.5 rounded border ${getColorsForProperty(r.property || r.parkingSpot || '').pill}`}>{r.property || r.parkingSpot}</span>
                     {r.apartment}
                   </p>
                 </div>
                 <div className="text-sm">
                   <p className="font-semibold text-gray-800">{r.guestName} <span className="text-gray-500 font-normal">({r.licensePlate || 'Targa Mnc.'})</span></p>
                 </div>
                 {!r.ztlCreated && (
                   <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                     <AlertTriangle size={14} /> Permesso ZTL NON Creato
                   </div>
                 )}
               </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-100 border-t-blue-600"></div>
          <p className="text-sm text-blue-600 font-medium">Caricamento calendario...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-5">
            <div className="flex flex-row items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 capitalize flex items-center gap-2">
                <CalendarIcon className="text-blue-500" size={20} />
                {safeFormat(currentDate, 'MMMM yyyy', { locale: it })}
              </h2>
              <div className="flex bg-gray-50 rounded-lg p-1 border border-gray-100">
                <button onClick={handlePrevMonth} className="p-1.5 text-gray-500 hover:text-blue-700 hover:bg-white rounded transition-all">
                  <ChevronLeft size={18} />
                </button>
                <div className="w-1"></div>
                <button onClick={handleNextMonth} className="p-1.5 text-gray-500 hover:text-blue-700 hover:bg-white rounded transition-all">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-100">
              <div className="grid grid-cols-7 gap-px">
                {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
                  <div key={day} className="bg-gray-50 text-center font-semibold text-[10px] sm:text-xs text-gray-500 py-1.5 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px">
                {daysInMonth.map((day, idx) => {
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const dayReservations = getReservationsForDay(day);
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <div 
                      key={idx} 
                      onClick={() => canEdit ? openAddModal(day) : undefined}
                      className={`
                        min-h-[56px] sm:min-h-[80px] relative transition-colors group flex flex-col
                        ${!isCurrentMonth ? 'bg-gray-50/60 text-gray-400' : 'bg-white text-gray-900'}
                        ${canEdit ? 'cursor-pointer hover:bg-blue-50/30' : ''}
                      `}
                    >
                      <span className={`
                        absolute top-1 right-1 sm:top-1.5 sm:right-1.5 text-[10px] sm:text-xs font-semibold w-5 h-5 sm:w-5 sm:h-5 flex items-center justify-center rounded-full z-20
                        ${isToday ? 'bg-blue-600 text-white' : 'text-gray-500'}
                      `}>
                        {safeFormat(day, 'd')}
                      </span>
                      
                      <div className="mt-6 mb-1 w-full space-y-1 z-10 flex flex-col">
                        {Array.from({ length: dayReservations.length > 0 ? Math.max(...dayReservations.map(r => tracksMap.get(r.id) || 0)) + 1 : 0 }).map((_, trackIdx) => {
                          const reservation = dayReservations.find(r => tracksMap.get(r.id) === trackIdx);
                          
                          if (!reservation) {
                            return <div key={`empty-${trackIdx}`} className="h-5 sm:h-8 w-full invisible"></div>;
                          }

                          const checkDate = startOfDay(day);
                          const resStart = startOfDay(reservation.startDate);
                          const resEnd = startOfDay(reservation.endDate);
                          const isStartDay = isSameDay(checkDate, resStart);
                          const isSameBookingDay = isSameDay(resStart, resEnd);
                          const isLastActiveDay = isSameBookingDay ? isSameDay(checkDate, resStart) : isSameDay(checkDate, subDays(resEnd, 1));
                          
                          const isMon = day.getDay() === 1;
                          const isFirstVisibleDay = idx === 0;
                          const showLabel = isStartDay || isMon || isFirstVisibleDay;
                          
                          const c = getColorsForProperty(reservation.property || reservation.parkingSpot || '');
                          
                          return (
                            <div key={reservation.id} className={`flex w-full ${isStartDay ? 'pl-1 sm:pl-1.5' : ''} ${isLastActiveDay ? 'pr-1 sm:pr-1.5' : ''}`}>
                              <div 
                                onClick={(e) => { e.stopPropagation(); canEdit && openEditModal(reservation); }}
                                className={`
                                  h-5 sm:h-8 w-full flex flex-col justify-center transition-all duration-200
                                  ${isStartDay ? 'rounded-l-md border-l' : 'border-l-0'}
                                  ${isLastActiveDay ? 'rounded-r-md border-r' : 'border-r-0'}
                                  ${c.bg} ${c.hover} border-y ${c.border} cursor-pointer
                                `}
                                title={`${reservation.property || reservation.parkingSpot} - ${reservation.apartment} - ${reservation.guestName}`}
                              >
                                {showLabel && (
                                  <div className="flex flex-col justify-center min-w-0 px-1 sm:px-2 w-full h-full overflow-hidden">
                                    <span className={`text-[8px] sm:text-[9px] font-bold ${c.text} truncate leading-tight uppercase`}>
                                      {reservation.apartment}
                                    </span>
                                    {reservation.guestName && (
                                      <span className={`text-[7px] sm:text-[8px] font-medium ${c.textSub} truncate leading-none mt-0.5 hidden sm:block`}>
                                        {reservation.guestName}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="mt-6 flex flex-wrap gap-4 items-center">
               <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
                  <span className="text-xs text-gray-500 font-medium">Libero</span>
               </div>
               {settings.properties.map(p => {
                 const c = getColorsForProperty(p);
                 return (
                   <div key={p} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded ${c.bg} border ${c.border}`}></div>
                      <span className="text-xs text-gray-500 font-medium">Occupato {p}</span>
                   </div>
                 );
               })}
            </div>
          </div>

          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Prossime in arrivo</h2>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {upcomingReservations.length === 0 ? (
                <div className="text-center text-gray-400 text-xs mt-8">Nessuna prenotazione futura.</div>
              ) : (
                <div className="space-y-3">
                  {upcomingReservations.map(res => (
                    <div key={res.id} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100 relative group">
                      
                      {canEdit && (
                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditModal(res)} className="p-1 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded transition" title="Modifica">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => handleDelete(res.id)} className="p-1 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded transition" title="Elimina">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}

                      <div className="flex gap-1.5 items-center mb-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${getColorsForProperty(res.property || res.parkingSpot || '').pill}`}>
                          {res.property || res.parkingSpot}
                        </span>
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded uppercase border border-blue-100">
                          {res.apartment}
                        </span>
                        {res.licensePlate && (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded uppercase border border-amber-100">
                            {res.licensePlate}
                          </span>
                        )}
                      </div>
                      
                      <h3 className="text-sm font-bold text-gray-900 leading-tight mb-2 pr-10">{res.guestName || 'Ospite'}</h3>
                      
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 bg-gray-50 py-1.5 px-2 rounded-lg border border-gray-100">
                        <span>{safeFormat(res.startDate, 'dd/MM/yy')}</span>
                        <ChevronRight size={10} className="text-gray-400" />
                        <span>{safeFormat(res.endDate, 'dd/MM/yy')}</span>
                      </div>
                      
                      {res.notes && (
                        <p className="mt-2 text-[11px] text-gray-500 italic border-l-2 border-blue-200 pl-2">
                          "{res.notes}"
                        </p>
                      )}
                      
                      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                        {!res.ztlCreated ? (
                           <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 p-1.5 rounded-md border border-red-100">
                             <AlertTriangle size={12} /> ZTL NON CREATO
                           </div>
                        ) : (
                           <div className="flex items-center justify-between gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 p-1.5 rounded-md border border-emerald-100">
                             <div className="flex items-center gap-1.5"><CheckCircle size={12} /> ZTL CREATO</div>
                             {res.ztlPdfBase64 && (
                               <a 
                                 href={res.ztlPdfBase64} 
                                 download={`Permesso_ZTL_${res.apartment.replace(/ /g, '_')}_${res.licensePlate||'targa'}.pdf`}
                                 className="text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded transition flex items-center gap-1"
                                 onClick={(e) => e.stopPropagation()}
                               >
                                 <FileText size={10} /> PDF
                               </a>
                             )}
                           </div>
                        )}
                        {res.cardDelivered && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 p-1.5 rounded-md border border-indigo-100">
                            <CheckCircle size={12} /> TESSERA IN CASA
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
      </>
      )}

      {/* Modal */}
      {isModalOpen && canEdit && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 border border-white/20">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                {editingId ? <Edit2 className="text-blue-600" size={20} /> : <CalendarIcon className="text-blue-600" size={20} />}
                {editingId ? 'Modifica Prenotazione' : 'Nuova Prenotazione'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Proprietario / Posto Auto</label>
                  <select 
                    required
                    value={formData.property}
                    onChange={e => {
                      const prop = e.target.value;
                      const availableApts = settings.propertyApartments[prop] || [];
                      const defaultApt = availableApts[0] || '';
                      setFormData({
                        ...formData, 
                        property: prop, 
                        parkingSpot: prop,
                        apartment: defaultApt
                      })
                    }}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900"
                  >
                    <option value="" disabled>Seleziona...</option>
                    {settings.properties.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Appartamento</label>
                  <select 
                    required
                    value={formData.apartment}
                    onChange={e => setFormData({...formData, apartment: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900"
                  >
                    <option value="" disabled>Seleziona...</option>
                    {(settings.propertyApartments[formData.property] || APARTMENTS).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Targa <span className="text-gray-400 font-medium">(Opz.)</span></label>
                  <input 
                    type="text" 
                    placeholder="AB 123 CD"
                    value={formData.licensePlate}
                    onChange={e => setFormData({...formData, licensePlate: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 uppercase placeholder:normal-case placeholder:font-normal placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nome Ospite</label>
                <input 
                  type="text" 
                  required
                  placeholder="Es. Mario Rossi"
                  value={formData.guestName}
                  onChange={e => setFormData({...formData, guestName: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4 bg-gray-50 p-3 sm:p-4 rounded-2xl border border-gray-100">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 text-center">Dal</label>
                  <input 
                    type="date" 
                    required
                    value={formData.startDate}
                    onChange={e => setFormData({...formData, startDate: e.target.value})}
                    className="w-full px-2 sm:px-3 py-2.5 sm:py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm font-semibold text-gray-900 text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 text-center">Al</label>
                  <input 
                    type="date" 
                    required
                    value={formData.endDate}
                    onChange={e => setFormData({...formData, endDate: e.target.value})}
                    className="w-full px-2 sm:px-3 py-2.5 sm:py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm font-semibold text-gray-900 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Note Interne <span className="text-gray-400 font-medium">(Opz.)</span></label>
                <textarea 
                  rows={2}
                  placeholder="Annotazioni sulla prenotazione..."
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 resize-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.cardDelivered}
                    onChange={(e) => setFormData({ ...formData, cardDelivered: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-bold text-gray-900">Tessera lasciata in appartamento</span>
                </label>

                <div className="h-px w-full bg-blue-100 my-2"></div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.ztlCreated}
                    onChange={(e) => setFormData({ ...formData, ztlCreated: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-bold text-gray-900">Permesso ZTL Creato</span>
                </label>

                {formData.ztlCreated && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Carica PDF Permesso</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                             alert("Il file è troppo grande. Massimo 2MB.");
                             e.target.value = '';
                             return;
                          }
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setFormData({ ...formData, ztlPdfBase64: event.target?.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
                    />
                    {formData.ztlPdfBase64 && (
                      <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
                        <CheckCircle size={14} /> PDF caricato
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 px-6 pb-6">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Annulla
                </button>
                {editingId && (
                  <button 
                    type="button"
                    onClick={() => { handleDelete(editingId); setIsModalOpen(false); }}
                    className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-xl font-medium transition shadow-sm cursor-pointer flex items-center justify-center"
                    title="Elimina Prenotazione"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition flex items-center justify-center shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Salvataggio...' : (editingId ? 'Salva Modifiche' : 'Salva Prenotazione')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface ApartmentReportData {
  apartment: string;
  monthly: number[];
  total: number;
  sunriseMonthly: number[];
  sunriseTotal: number;
  refundMonthly: number[];
  refundTotal: number;
}

function ParkingReport({ reservations, reportYear, setReportYear, apartments, onRefresh, isLoading }: any) {
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  const reportData = useMemo(() => {
    const reportMap = new Map<string, ApartmentReportData>();
    
    apartments.forEach((apt: string) => {
       reportMap.set(apt, {
          apartment: apt,
          monthly: Array(12).fill(0),
          total: 0,
          sunriseMonthly: Array(12).fill(0),
          sunriseTotal: 0,
          refundMonthly: Array(12).fill(0),
          refundTotal: 0
       });
    });
    
    // Prima passata: conteggi base (utilizzo abbonamento)
    reservations.forEach((res: any) => {
      if (!res.startDate || !res.endDate) return;
      
      const isSunrise = /abb(onamento)?\.?\s*sunrise/i.test(res.notes || '');
      
      let current = startOfDay(new Date(res.startDate));
      const end = startOfDay(new Date(res.endDate));
      const limit = isSameDay(current, end) ? addDays(end, 1) : end;
      
      while (current < limit) {
         if (current.getFullYear() === reportYear) {
             const m = current.getMonth();
             let aptData = reportMap.get(res.apartment);
             if (!aptData) {
                 aptData = { apartment: res.apartment, monthly: Array(12).fill(0), total: 0, sunriseMonthly: Array(12).fill(0), sunriseTotal: 0, refundMonthly: Array(12).fill(0), refundTotal: 0 };
                 reportMap.set(res.apartment, aptData);
             }
             if (isSunrise) {
                 aptData.sunriseMonthly[m]++;
                 aptData.sunriseTotal++;
             } else {
                 aptData.monthly[m]++;
                 aptData.total++;
             }
         }
         current = addDays(current, 1);
      }
    });

    // Seconda passata: calcolo dei rimborsi (Penali) a Sunrise
    const sunriseAptName = apartments.find((a: string) => a.toLowerCase().includes('sunrise')) || 'Sunrise';
    const sunriseReservations = reservations.filter((r: any) => r.apartment === sunriseAptName);
    const borrowerReservations = reservations.filter((r: any) => r.apartment !== sunriseAptName && /abb(onamento)?\.?\s*sunrise/i.test(r.notes || ''));

    sunriseReservations.forEach((sunRes: any) => {
       if (!sunRes.startDate || !sunRes.endDate) return;
       let current = startOfDay(new Date(sunRes.startDate));
       const end = startOfDay(new Date(sunRes.endDate));
       const limit = isSameDay(current, end) ? addDays(end, 1) : end;

       while (current < limit) {
          if (current.getFullYear() === reportYear) {
              const m = current.getMonth();
              
              // Verifichiamo se in questo giorno qualcun altro ha l'abbonamento
              const activeBorrowers = borrowerReservations.filter((borrower: any) => {
                 if (!borrower.startDate || !borrower.endDate) return false;
                 const bStart = startOfDay(new Date(borrower.startDate));
                 const bEnd = startOfDay(new Date(borrower.endDate));
                 return current >= bStart && current < (isSameDay(bStart, bEnd) ? addDays(bEnd, 1) : bEnd);
              });

              // Se Sunrise ha bisogno, ma l'abbonamento ce l'hanno gli altri, gli altri devono rimborsare Sunrise
              activeBorrowers.forEach((borrower: any) => {
                 const aptData = reportMap.get(borrower.apartment);
                 if (aptData) {
                     aptData.refundMonthly[m]++;
                     aptData.refundTotal++;
                 }
              });
          }
          current = addDays(current, 1);
       }
    });
    
    return Array.from(reportMap.values()).sort((a, b) => a.apartment.localeCompare(b.apartment));
  }, [reservations, reportYear, apartments]);

  const globalRefunds = useMemo(() => {
    return reportData.reduce((acc, r) => acc + r.refundTotal, 0);
  }, [reportData]);

  const getPassUsage = (row: any) => {
    const isSunrise = row.apartment.toLowerCase().includes('sunrise');
    if (isSunrise) {
      return (row.total + row.sunriseTotal) - globalRefunds;
    }
    return row.sunriseTotal;
  };

  const getNetUsage = (row: any) => {
    const isSunrise = row.apartment.toLowerCase().includes('sunrise');
    if (isSunrise) {
      return row.total + row.sunriseTotal;
    } else {
      return row.sunriseTotal - row.refundTotal;
    }
  };

  const exportCSV = () => {
    let csv = `Report Parcheggi Globale - ${reportYear}\n`;
    csv += `Appartamento;Gen;Feb;Mar;Apr;Mag;Giu;Lug;Ago;Set;Ott;Nov;Dic;Totale Notti;Uso Pass Sunrise;Pagato per Sunrise;Uso Netto Pass\n`;
    
    reportData.forEach(row => {
       csv += `${row.apartment};`;
       csv += `${row.monthly.map((val, i) => val + row.sunriseMonthly[i]).join(';')};`;
       csv += `${row.total + row.sunriseTotal};`;
       csv += `${getPassUsage(row)};`;
       csv += `${row.refundTotal};`;
       csv += `${getNetUsage(row)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `report_parcheggi_${reportYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF('landscape');
      
      doc.setFontSize(16);
      doc.text(`Report Utilizzo Parcheggi - Anno ${reportYear}`, 14, 15);
      
      doc.setFontSize(10);
      doc.text(`Generato il: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22);

      const headers = [
        ['Appartamento', ...months, 'Totale Notti', 'Uso Pass', 'Pagato x Sunrise', 'Uso Netto']
      ];

      const body = reportData.map(row => {
        const rowData: any[] = [row.apartment];
        months.forEach((_, i) => {
          const total = row.monthly[i] + row.sunriseMonthly[i];
          const sun = row.sunriseMonthly[i];
          if (total > 0) {
             rowData.push(sun > 0 ? `${total} (+${sun} S.)` : `${total}`);
          } else {
             rowData.push('-');
          }
        });
        rowData.push((row.total + row.sunriseTotal).toString());
        rowData.push(getPassUsage(row).toString());
        rowData.push(row.refundTotal.toString());
        rowData.push(getNetUsage(row).toString());
        return rowData;
      });

      autoTable(doc, {
        head: headers,
        body: body,
        startY: 28,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
        columnStyles: {
          0: { fontStyle: 'bold' },
          13: { fontStyle: 'bold', textColor: [37, 99, 235] },
          14: { fontStyle: 'bold', textColor: [217, 119, 6] },
          15: { fontStyle: 'bold', textColor: [225, 29, 72] },
          16: { fontStyle: 'bold', textColor: [16, 185, 129] }
        }
      });

      doc.save(`report_parcheggi_${reportYear}.pdf`);
    } catch (err: any) {
      console.error("PDF Export error:", err);
      alert(`Errore durante l'esportazione: ${err.message || 'Errore sconosciuto'}`);
    }
  };

  const [selectedApt, setSelectedApt] = useState<string>('all');
  
  const displayedData = selectedApt === 'all' 
    ? reportData 
    : reportData.filter(d => d.apartment === selectedApt);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Report Utilizzo Parcheggi
            {isLoading && <RefreshCw size={16} className="animate-spin text-blue-500" />}
          </h2>
          <p className="text-gray-500 text-sm">Analisi notti di occupazione per appartamento</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-sm rounded-lg transition-colors border border-blue-200"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> Aggiorna
          </button>
          
          <select 
            value={reportYear}
            onChange={(e) => setReportYear(Number(e.target.value))}
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[...Array(5)].map((_, i) => {
              const y = new Date().getFullYear() - 2 + i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          <select 
            value={selectedApt}
            onChange={(e) => setSelectedApt(e.target.value)}
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tutti gli Appartamenti</option>
            {apartments.map((a: string) => (
               <option key={a} value={a}>{a}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={exportCSV}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg transition-colors"
              title="Esporta in CSV"
            >
              <Download size={18} /> CSV
            </button>
            <button 
              onClick={exportPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-lg transition-colors"
              title="Esporta in PDF"
            >
              <FileText size={18} /> PDF
            </button>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 shadow-[1px_0_0_0_#f3f4f6]">Appartamento</th>
              {months.map(m => (
                <th key={m} className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">{m}</th>
              ))}
              <th className="px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-center bg-blue-50/50">Totale Notti</th>
              <th className="px-4 py-3 text-xs font-bold text-amber-600 uppercase tracking-wider text-center bg-amber-50/50">Uso Pass</th>
              <th className="px-4 py-3 text-xs font-bold text-rose-600 uppercase tracking-wider text-center bg-rose-50/50">Pagato x Sunrise</th>
              <th className="px-4 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wider text-center bg-emerald-50/50">Uso Netto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-bold text-gray-900 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#f3f4f6] group-hover:bg-gray-50/50 whitespace-nowrap">
                  {row.apartment}
                </td>
                {row.monthly.map((val, mIdx) => {
                  const sun = row.sunriseMonthly[mIdx];
                  const ref = row.refundMonthly[mIdx];
                  const tot = val + sun;
                  return (
                    <td key={mIdx} className="px-4 py-3 text-sm text-center">
                       {tot > 0 || ref > 0 ? (
                         <div className="flex flex-col items-center justify-center">
                           {tot > 0 ? <span className="font-bold text-gray-800">{tot}</span> : <span className="text-gray-300">-</span>}
                           {sun > 0 && <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1 rounded mt-0.5 whitespace-nowrap" title="Utilizzato Abbonamento Sunrise">+{sun} Pass</span>}
                           {ref > 0 && <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1 rounded mt-0.5 whitespace-nowrap border border-rose-200" title="Ticket pagati per Sunrise">-{ref} Pagati</span>}
                         </div>
                       ) : (
                         <span className="text-gray-300">-</span>
                       )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-sm text-center font-black text-blue-700 bg-blue-50/30">
                  {row.total + row.sunriseTotal}
                </td>
                <td className="px-4 py-3 text-sm text-center font-bold text-amber-700 bg-amber-50/30">
                  {getPassUsage(row) > 0 ? getPassUsage(row) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-center font-bold text-rose-700 bg-rose-50/30">
                  {row.refundTotal > 0 ? row.refundTotal : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-center font-black text-emerald-700 bg-emerald-50/30">
                  {getNetUsage(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
