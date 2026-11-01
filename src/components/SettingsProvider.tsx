import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { logger } from '../utils/logger';

export interface AppSettings {
  properties: string[];
  apartments: string[];
  propertyApartments: Record<string, string[]>;
  apartmentProperty: Record<string, string>;
  incomeCategories: string[];
  expenseCategories: string[];
  workCategories: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  properties: ['Missale Fabio', 'Ghislotti Raffaello'],
  apartments: ['Namaste', 'Buk', 'Sunrise'],
  propertyApartments: {
    'Missale Fabio': ['Namaste', 'Buk'],
    'Ghislotti Raffaello': ['Sunrise']
  },
  apartmentProperty: {
    'Namaste': 'Missale Fabio',
    'Buk': 'Missale Fabio',
    'Sunrise': 'Ghislotti Raffaello'
  },
  incomeCategories: ['Pagamento Soggiorno', 'Tassa di Soggiorno', 'Pagamento Pulizie', 'Vendita Vino', 'Parking', 'Altro'],
  expenseCategories: ['Spesa Alimentare', 'Pulizie', 'Pagamento Pulizie', 'Manutenzione', 'Forniture', 'Altro'],
  workCategories: ['Pulizia Ordinaria', 'Pulizia a Fondo', 'Check-in Extra', 'Manutenzione', 'Altro']
};

const SettingsContext = createContext<{ settings: AppSettings, loading: boolean }>({
  settings: DEFAULT_SETTINGS,
  loading: true
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timeoutId = setTimeout(() => {
       logger.error('SettingsProvider', 'Timeout loading settings global from Firebase');
       setLoading(false); // Sblocca l'appliazione se Firebase fallisce in silenzio
    }, 15000);

    const unsub = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      clearTimeout(timeoutId);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({
          properties: data.properties || DEFAULT_SETTINGS.properties,
          apartments: data.apartments || DEFAULT_SETTINGS.apartments,
          propertyApartments: data.propertyApartments || DEFAULT_SETTINGS.propertyApartments,
          apartmentProperty: data.apartmentProperty || DEFAULT_SETTINGS.apartmentProperty,
          incomeCategories: data.incomeCategories || DEFAULT_SETTINGS.incomeCategories,
          expenseCategories: data.expenseCategories || DEFAULT_SETTINGS.expenseCategories,
          workCategories: data.workCategories || DEFAULT_SETTINGS.workCategories
        });
        logger.info('SettingsProvider', 'Settings loaded successfully');
      } else {
        logger.warn('SettingsProvider', 'Settings document does not exist, using defaults');
        setSettings(DEFAULT_SETTINGS);
      }
      setLoading(false);
    }, (error) => {
      logger.error('SettingsProvider', 'Settings load error', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
