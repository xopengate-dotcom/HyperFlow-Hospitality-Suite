export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  barcode?: string;
  imageUrl?: string;
  showInHousekeeping?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Item {
  id: string;
  property?: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  price?: number;
  minQuantity?: number; // threshold for alerts
  imageUrl?: string; // base64 string
  barcode?: string;
  showInHousekeeping?: boolean; // visibility for housekkeping
  hkOrder?: number; // Sorting order in housekeeping
  visibleInApartments?: string[]; // Apartments where this item should be visible (especially for suppliers)
  createdAt: Date;
  updatedAt: Date;
}

export interface Operator {
  id: string;
  name: string;
  email: string;
  hideFinancials?: boolean;
  isAdmin?: boolean;
  role?: 'magazzino' | 'acquisti' | 'admin';
  permissions?: {
    dashboard?: boolean;
    inventory?: boolean;
    orders?: boolean;
    history?: boolean;
    cashflow?: boolean;
    cashflowEdit?: boolean;
    reports?: boolean;
    properties?: boolean;
    parking?: boolean;
    parkingEdit?: boolean;
  };
  createdAt: Date;
}

export interface Transaction {
  id: string;
  property?: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out' | 'edit';
  quantity: number;
  apartment?: string; // e.g. "Girasole", "Margherita"
  pricePerUnit?: number;
  operator?: string;
  notes?: string; // custom notes
  date: Date;
  userId: string;
}

export interface MonthReport {
  month: string; // YYYY-MM
  totalIn: number;
  totalOut: number;
  byApartment: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface RestockOrderItem {
  itemId: string;
  itemName: string;
  quantityRequested: number;
  quantityPurchased?: number;
  quantityDelivered?: number;
  unitPrice?: number;
  isPurchased?: boolean;
}

export interface RestockOrder {
  id: string;
  orderNumber: string;
  property?: string;
  requestedBy: string;
  items: RestockOrderItem[];
  status: 'pending' | 'purchased' | 'fulfilled';
  totalCost?: number;
  createdAt: Date;
  purchasedAt?: Date;
  fulfilledAt?: Date;
}

export interface Cashflow {
  id: string;
  property?: string;
  apartment?: string;
  date: Date;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  receiptUrl?: string;
  operator: string;
  createdAt: Date;
  updatedAt: Date;
  itemId?: string; // Legacy
  itemQuantity?: number; // Legacy
  items?: { itemId: string; quantity: number; price?: number; name?: string }[];
  isLiquidation?: boolean;
}

export interface WorkActivity {
  id: string;
  property?: string;
  date: Date;
  apartment: string;
  category: string;
  description?: string;
  hours?: number;
  amount: number;
  status: 'pending' | 'liquidated';
  operator: string;
  liquidationId?: string; // links to cashflow expense
  createdAt: Date;
  updatedAt: Date;
}

export interface CashflowLog {
  cashflowId: string;
  action: 'update';
  modifiedBy: string;
  modifiedById: string;
  timestamp: Date;
  changes: string;
}

export interface ParkingReservation {
  id: string;
  parkingSpot?: string;
  property?: string;
  apartment: string;
  guestName: string;
  licensePlate?: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  ztlCreated?: boolean;
  ztlPdfBase64?: string;
  cardDelivered?: boolean;
  operator: string;
  createdAt: Date;
  updatedAt: Date;
}

