import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
  deleteField,
  limit,
  where,
  increment
} from 'firebase/firestore';
import { db, auth } from './config';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Item, Transaction, Operator, RestockOrder, RestockOrderItem, Cashflow, CashflowLog, CatalogItem, WorkActivity, ParkingReservation } from '../types';
import { logger } from '../utils/logger';

// Helper per eseguire letture. In precedenza usava Promise.race che causava leak di connessioni
export async function executeRead<T>(promise: Promise<T>, timeoutMs = 15000, context = 'read'): Promise<T> {
  // Lasciamo che Firebase gestisca nativamente il caricamento (con cache o rete)
  // Non usiamo più Promise.race perchè non killa la promise originale di firebase
  // portando all'esaurimento delle socket in caso di ripetuti refresh manuali.
  
  return new Promise((resolve, reject) => {
    let isResolved = false;
    
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        logger.error('Firebase', `Timeout error: Read operation [${context}] exceeded ${timeoutMs}ms.`);
        isResolved = true;
        reject(new Error(`Timeout caricamento dati [${context}]`));
      }
    }, timeoutMs);

    promise.then((result) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        resolve(result);
      }
    }).catch((error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
          logger.error('FirebaseAuth', `Permission denied on [${context}]. UID: ${auth.currentUser?.uid}`, error);
        } else {
          logger.error('Firebase', `Read error in context [${context}]`, error);
        }
        reject(error);
      }
    });
  });
}

// Helper per eseguire le scritture in Firebase gestendo l'offline o le connessioni lente.
function executeWrite<T>(promise: Promise<T>, timeoutMs = 1500): Promise<T | void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    promise.catch(e => {
      logger.warn('Firebase', "Scrittura offline messa in coda:", e);
      logSystemError('executeWrite/offlineQueueError', e);
    });
    return Promise.resolve();
  }
  // Rimosso Promise.race. L'operazione aspetterà Firebase (che a sua volta 
  // usa un sistema di backoff integrato). Questo previene stati inconsistenti.
  return promise.catch(e => {
    logger.error('Firebase', "Scrittura fallita:", e);
    logSystemError('executeWrite/error', e);
    throw e;
  });
}

let getItemsCache: { data: Item[], timestamp: number } | null = null;
let getTransactionsCache: { data: Transaction[], timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 seconds

export function invalidateCache() {
  getItemsCache = null;
  getTransactionsCache = null;
}


export const CATEGORIES = ['Pulizia', 'Biancheria', 'Dispensa', 'Altro'];

export async function logSystemError(context: string, error: any) {
  try {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // We intentionally don't use executeWrite here to allow slow writes to proceed normally if possible
    await addDoc(collection(db, 'systemLogs'), {
      context,
      message: errorMsg,
      stack: stack || null,
      userAgent: navigator.userAgent,
      url: window.location.href,
      user: auth.currentUser?.email || auth.currentUser?.uid || 'anonymous',
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Failed to log system error to Firestore", e);
  }
}


export function logAudit(action: 'CREATE' | 'UPDATE' | 'DELETE', collectionName: string, documentId: string, details: any = '') {
  try {
    if (!auth.currentUser) return;
    const operator = auth.currentUser.displayName || auth.currentUser.email || 'Sistema';
    let parsedDetails = details;
    if (typeof details === 'object') {
       try { parsedDetails = JSON.stringify(details); } catch (e) { parsedDetails = String(details); }
    }
    // Eseguito in modo asincrono senza bloccare
    addDoc(collection(db, 'auditLogs'), {
      action,
      collectionName,
      documentId,
      details: parsedDetails,
      operator,
      userId: auth.currentUser.uid,
      timestamp: serverTimestamp()
    }).catch(e => console.warn("Failed to write audit", e));
  } catch (err) {}
}

function formatError(error: any, operationType: string, path: string | null): never {
  logSystemError(`FirebaseError /${operationType} - ${path || 'unknown'}`, error);

  if (error instanceof Error && error.message.includes('missing or insufficient permissions')) {
    const authState = auth.currentUser;
    throw new Error(JSON.stringify({
      error: 'Missing or insufficient permissions',
      operationType,
      path,
      authInfo: authState ? {
        userId: authState.uid,
        email: authState.email,
        emailVerified: authState.emailVerified,
        isAnonymous: authState.isAnonymous,
        providerInfo: authState.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName,
          email: p.email
        }))
      } : null
    }));
  }
  throw error;
}

export async function getOperators(): Promise<Operator[]> {
  try {
    const q = query(collection(db, 'operators'), orderBy('name', 'asc'));
    const snapshot = await executeRead(getDocs(q), 15000, 'getOperators');
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        email: data.email,
        hideFinancials: data.hideFinancials,
        isAdmin: data.isAdmin,
        role: data.role,
        permissions: data.permissions,
        createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Date ? data.createdAt : new Date()),
      } as Operator;
    });
  } catch (error) {
    return formatError(error, 'list', 'operators');
  }
}

export async function addOperator(name: string, email: string, defaultPassword?: string, hideFinancials?: boolean, isAdmin?: boolean, role?: 'magazzino' | 'acquisti' | 'admin', permissions?: any): Promise<void> {
  let secondaryAuth;
  try {
    // We use a secondary app to avoid signing out the current Admin user
    const secondaryApp = initializeApp(firebaseConfig, 'SecondaryAuthApp');
    secondaryAuth = getAuth(secondaryApp);
    
    // Create the user in Firebase Auth
    const pwd = defaultPassword || 'Cambiami123!';
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pwd);
    
    // Set their display name
    await updateProfile(userCredential.user, { displayName: name });
    
    // Register the operator document with the exact same UID so rules work
    const docData: any = {
      name,
      email,
      createdAt: serverTimestamp()
    };
    if (hideFinancials) {
      docData.hideFinancials = true;
    }
    if (isAdmin) {
      docData.isAdmin = true;
    }
    if (permissions) {
      docData.permissions = permissions;
    }
    if (role) {
      docData.role = role;
    }

    await executeWrite(setDoc(doc(db, 'operators', userCredential.user.uid), docData));

  } catch (error: any) {
    if (error.code === 'auth/operation-not-allowed') {
       throw new Error("Autenticazione Email/Password non abilitata. Vai sulla console Firebase (Authentication -> Sign-in method) e abilita Email/Password per poter creare Account Operatore diretti.");
    }
    if (error.code === 'auth/email-already-in-use') {
       throw new Error("Esiste già un account con questo indirizzo email.");
    }
    if (error.code === 'auth/weak-password') {
       throw new Error("La password fornita è troppo debole. Inserisci almeno 6 caratteri.");
    }
    return formatError(error, 'create', 'operators');
  } finally {
    if (secondaryAuth) {
      await secondaryAuth.signOut();
    }
  }
}

export async function updateOperator(id: string, updates: { name?: string, hideFinancials?: boolean, isAdmin?: boolean, role?: 'magazzino' | 'acquisti' | 'admin', permissions?: any }): Promise<void> {
  try {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.permissions !== undefined) payload.permissions = updates.permissions;
    if (updates.hideFinancials !== undefined) payload.hideFinancials = updates.hideFinancials;
    if (updates.isAdmin !== undefined) payload.isAdmin = updates.isAdmin;
    if (updates.role !== undefined) payload.role = updates.role;
    
    await executeWrite(updateDoc(doc(db, 'operators', id), payload));
  } catch (error: any) {
    return formatError(error, 'update', `operators/${id}`);
  }
}

export async function deleteOperator(id: string): Promise<void> {
  try {
    await executeWrite(deleteDoc(doc(db, 'operators', id)));
  } catch (error) {
    return formatError(error, 'delete', `operators/${id}`);
  }
}

export async function resetOperatorPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    throw new Error("Errore nell'invio dell'email di reset: " + error.message);
  }
}

export async function getItems(): Promise<Item[]> {
  if (getItemsCache && Date.now() - getItemsCache.timestamp < CACHE_TTL) {
    return getItemsCache.data;
  }
  try {
    const q = query(collection(db, 'items'), orderBy('category'), orderBy('name'));
    const snapshot = await executeRead(getDocs(q), 15000, 'getItems');
    const data = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        property: data.property,
        name: data.name,
        category: data.category,
        quantity: data.quantity,
        unit: data.unit,
        price: data.price,
        minQuantity: data.minQuantity,
        imageUrl: data.imageUrl,
        barcode: data.barcode,
        apartments: data.apartments,
        showInHousekeeping: data.showInHousekeeping,
        hkOrder: data.hkOrder,
        createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Date ? data.createdAt : new Date()),
        updatedAt: data.updatedAt?.toDate?.() || (data.updatedAt instanceof Date ? data.updatedAt : new Date()),
      } as Item;
    });
    getItemsCache = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    return formatError(error, 'list', 'items');
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  try {
    const txRef = doc(db, 'transactions', id);
    await executeWrite(deleteDoc(txRef));
    invalidateCache();
  } catch (error) {
    return formatError(error, 'delete', 'transactions');
  }
}

export async function getTransactions(limitCount?: number): Promise<Transaction[]> {
  if (!limitCount && getTransactionsCache && Date.now() - getTransactionsCache.timestamp < CACHE_TTL) {
    return getTransactionsCache.data;
  }
  try {
    let q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    if (limitCount !== undefined) {
      q = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(limitCount));
    }
    const snapshot = await executeRead(getDocs(q), 15000, 'getTransactions');
    const data = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        property: data.property,
        itemId: data.itemId,
        itemName: data.itemName,
        type: data.type,
        quantity: data.quantity,
        apartment: data.apartment,
        pricePerUnit: data.pricePerUnit,
        operator: data.operator,
        notes: data.notes,
        date: data.date?.toDate?.() || (data.date instanceof Date ? data.date : new Date()),
        userId: data.userId,
      } as Transaction;
    });
    if (!limitCount) {
      getTransactionsCache = { data, timestamp: Date.now() };
    }
    return data;
  } catch (error) {
    return formatError(error, 'list', 'transactions');
  }
}

export async function addItem(item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  invalidateCache();
  try {
    const batch = writeBatch(db);
    
    // Create new item ref
    const itemRef = doc(collection(db, 'items'));
    
    const cleanItem = { ...item };
    Object.keys(cleanItem).forEach(key => (cleanItem as any)[key] === undefined && delete (cleanItem as any)[key]);
    
    if (cleanItem.quantity !== undefined) cleanItem.quantity = Number(cleanItem.quantity) || 0;
    if (cleanItem.price !== undefined) cleanItem.price = Number(cleanItem.price) || 0;
    if (cleanItem.minQuantity !== undefined) cleanItem.minQuantity = Number(cleanItem.minQuantity) || 0;

    batch.set(itemRef, {
      ...cleanItem,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';

    const parsedItemQuantity = Number(item.quantity) || 0;
    
    // If there is an initial quantity, record it as an 'in' transaction
    if (parsedItemQuantity > 0) {
      const transRef = doc(collection(db, 'transactions'));
      
      const txData: any = {
        itemId: itemRef.id,
        itemName: item.name,
        type: 'in',
        quantity: parsedItemQuantity,
        notes: `Carico iniziale in magazzino ${item.property || ''}`.trim(),
        date: serverTimestamp(),
        userId: auth.currentUser?.uid || '',
        operator: currentOperator
      };
      
      if (item.property !== undefined) {
        txData.property = item.property;
      }
      
      if (item.price !== undefined) {
        txData.pricePerUnit = Number(item.price) || 0;
      }
      
      batch.set(transRef, txData);
    } else {
      // Log edit
      const transRef = doc(collection(db, 'transactions'));
      const editTxData: any = {
        itemId: itemRef.id,
        itemName: item.name,
        type: 'edit',
        quantity: 0,
        date: serverTimestamp(),
        userId: auth.currentUser?.uid || '',
        operator: currentOperator
      };
      if (item.property !== undefined) {
        editTxData.property = item.property;
      }
      batch.set(transRef, editTxData);
    }

    await executeWrite(batch.commit());
    return itemRef.id;
  } catch (error) {
    return formatError(error, 'create', 'items/transactions (batch)');
  }
}

export async function updateHousekeepingOrder(orders: {id: string, hkOrder: number}[]): Promise<void> {
  const batch = writeBatch(db);
  for (const o of orders) {
    const ref = doc(db, 'items', o.id);
    batch.update(ref, { hkOrder: o.hkOrder, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  invalidateCache();
}

export async function updateItem(id: string, updates: Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  invalidateCache();
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    
    // Fetch current item to get its data
    const itemDoc = await getDoc(doc(db, 'items', id));
    const currentData = itemDoc.exists() ? itemDoc.data() : null;
    const currentItemName = currentData?.name || 'Articolo modificato';
    
    const cleanUpdates = { ...updates };
    const changedFields: string[] = [];

    const targetName = updates.name !== undefined ? updates.name : (currentData?.name || '');
    const targetProp = 'property' in updates ? updates.property : currentData?.property;
    const hasMovedOrRenamed = (updates.name !== undefined && updates.name !== currentData?.name) || 
                              ('property' in updates && updates.property !== currentData?.property);

    if (hasMovedOrRenamed && currentData) {
       const q = query(collection(db, 'items'), where('name', '==', targetName));
       const dupSnap = await getDocs(q);
       const identicalItem = dupSnap.docs.find(d => {
          if (d.id === id) return false;
          const dProp = d.data().property;
          return dProp === targetProp;
       });

       if (identicalItem) {
          const dupData = identicalItem.data();
          const batchMerge = writeBatch(db);
          const qtyToMove = updates.quantity !== undefined ? updates.quantity : (currentData?.quantity || 0);
          
          batchMerge.update(doc(db, 'items', identicalItem.id), {
             quantity: (dupData.quantity || 0) + qtyToMove,
             updatedAt: serverTimestamp()
          });
          batchMerge.delete(doc(db, 'items', id));
          
          batchMerge.set(doc(collection(db, 'transactions')), {
             itemId: identicalItem.id,
             itemName: targetName,
             type: 'in',
             quantity: qtyToMove,
             notes: `Unione: riceve da ${currentData.name} (${currentData.property || 'Tutte'})`,
             date: serverTimestamp(),
             userId: auth.currentUser?.uid || '',
             operator: currentOperator
          });
          
          batchMerge.set(doc(collection(db, 'transactions')), {
             itemId: id,
             itemName: currentData.name,
             type: 'out',
             quantity: currentData.quantity || 0,
             notes: `Unito in ${targetName} (${targetProp || 'Tutte'}) -> Cancellato`,
             date: serverTimestamp(),
             userId: auth.currentUser?.uid || '',
             operator: currentOperator
          });

          await executeWrite(batchMerge.commit());
            logAudit('UPDATE', 'items', id, updates);
  return;
       }
    }

    Object.keys(cleanUpdates).forEach(key => {
      const newVal = (cleanUpdates as any)[key];
      if (newVal === undefined) {
        (cleanUpdates as any)[key] = deleteField();
      } else if (currentData && currentData[key] !== newVal) {
         // Only log if effectively changed
         // Special handling for some keys to be human readable
         if (key === 'quantity' || key === 'price' || key === 'minQuantity' || key === 'category' || key === 'name') {
           changedFields.push(`${key}: ${currentData[key]} -> ${newVal}`);
         } else if (key !== 'imageUrl' && key !== 'showInHousekeeping') {
           changedFields.push(key);
         }
      }
    });

    const notesStr = changedFields.length > 0 
      ? `Modifiche: ${changedFields.join(' | ')}`
      : 'Articolo aggiornato/confermato';
    
    // Alway log edit transactions when an item is modified
    const batch = writeBatch(db);
    batch.update(doc(db, 'items', id), {
      ...cleanUpdates,
      updatedAt: serverTimestamp()
    });
    
    batch.set(doc(collection(db, 'transactions')), {
      itemId: id,
      itemName: updates.name || currentItemName,
      type: 'edit',
      quantity: 0,
      notes: notesStr,
      date: serverTimestamp(),
      userId: auth.currentUser?.uid || '',
      operator: currentOperator
    });
    
    await executeWrite(batch.commit());
    logAudit('UPDATE', 'items', id, cleanUpdates);
  } catch (error) {
    return formatError(error, 'update', `items/${id}`);
  }
}

export async function deleteItem(id: string): Promise<void> {
  invalidateCache();
  try {
      logAudit('DELETE', 'items', id, 'Deleted item ' + id);
  await executeWrite(deleteDoc(doc(db, 'items', id)));
  } catch (error) {
    return formatError(error, 'delete', `items/${id}`);
  }
}

export async function freezeTransactionsHistory(
  apartmentProperty: Record<string, string>,
  defaultProperty: string
): Promise<string> {
  const collectionsToFreeze = ['transactions', 'cashflows', 'restockOrders', 'work_activities'];
  let count = 0;
  
  const chunks = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  for (const collName of collectionsToFreeze) {
    const q = collection(db, collName);
    const snapshot = await executeRead(getDocs(q), 15000, `freezeHistory_${collName}`);

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      let updates: any = {};
      let needsUpdate = false;

      const isPropertyUnsetOrGeneric = !data.property || data.property === 'Tutte le Proprietà' || data.property === 'Tutte';
      
      if (isPropertyUnsetOrGeneric && data.apartment) {
        updates.property = apartmentProperty[data.apartment] || defaultProperty;
        needsUpdate = true;
      } else if (!data.property) {
        updates.property = defaultProperty;
        needsUpdate = true;
      }

      // Ensure that old docs possess necessary base fields to pass strict Firestore update validations
      if (needsUpdate) {
        if (collName === 'cashflows' || collName === 'work_activities') {
           if (!data.createdAt) updates.createdAt = serverTimestamp();
           if (!data.updatedAt) updates.updatedAt = serverTimestamp();
           if (data.operator === undefined) updates.operator = 'Sistema';
           if (data.apartment === undefined) updates.apartment = '';
           if (data.amount === undefined) updates.amount = 0;
           if (!data.date) updates.date = serverTimestamp();
           if (!data.category) updates.category = 'Altro';
           
           if (collName === 'cashflows' && !data.type) updates.type = 'expense';
           if (collName === 'work_activities' && !data.status) updates.status = 'pending';
        } else if (collName === 'transactions') {
           if (!data.date) updates.date = serverTimestamp();
           if (!data.userId) updates.userId = auth.currentUser?.uid || 'unknown';
           if (!data.type) updates.type = 'in';
           if (data.quantity === undefined) updates.quantity = 0;
           if (!data.itemId) updates.itemId = 'missing';
           if (!data.itemName) updates.itemName = 'Sconosciuto';
        } else if (collName === 'restockOrders') {
           if (!data.createdAt) updates.createdAt = serverTimestamp();
           if (!data.status) updates.status = 'pending';
           if (!data.items) updates.items = [];
           if (!data.requestedBy) updates.requestedBy = 'Sistema';
           if (!data.orderNumber) updates.orderNumber = 'N/A';
        }
      }

      if (needsUpdate) {
        currentBatch.update(docSnap.ref, updates);
        opCount++;
        count++;
        
        if (opCount === 490) {
          chunks.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      }
    });
  }

  if (opCount > 0) {
    chunks.push(currentBatch.commit());
  }

  await Promise.all(chunks);
  invalidateCache(); // Discard memory caches to force reloading new properties
  return `Aggiornati e congelati ${count} record storici.`;
}

export async function addTransaction(
  item: Item,
  type: 'in' | 'out',
  amount: number,
  apartment?: string,
  notes?: string,
  customDate?: Date | null
): Promise<void> {
  try {
    const batch = writeBatch(db);
    
    // 1. Update the item stock
    const itemRef = doc(db, 'items', item.id);
    const parsedAmount = Number(amount) || 0;
    batch.update(itemRef, { 
      quantity: increment(type === 'in' ? parsedAmount : -parsedAmount),
      updatedAt: serverTimestamp()
    });

    // 2. Add transaction record
    const transRef = doc(collection(db, 'transactions'));
    
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';

    const txData: any = {
      itemId: item.id,
      itemName: item.name,
      type,
      quantity: parsedAmount,
      date: customDate ? customDate : serverTimestamp(),
      userId: auth.currentUser?.uid || '',
      operator: currentOperator
    };

    let determinedProperty = item.property;

    if (apartment && (!item.property || item.property === 'Tutte le Proprietà' || item.property === 'Tutte')) {
       try {
         const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
         if (settingsSnap.exists()) {
            const s = settingsSnap.data();
            if (s.apartmentProperty && s.apartmentProperty[apartment]) {
               determinedProperty = s.apartmentProperty[apartment];
            }
         }
       } catch (e) {}
    }

    if (determinedProperty !== undefined) {
      txData.property = determinedProperty;
    }

    if (apartment) {
      txData.apartment = apartment;
    }
    
    if (item.price !== undefined) {
      txData.pricePerUnit = item.price;
    }

    if (notes && notes.trim() !== '') {
      txData.notes = notes.trim();
    } else {
      if (type === 'in') {
         txData.notes = `Carico in magazzino ${determinedProperty || ''}`.trim();
      } else if (type === 'out') {
         txData.notes = `Scarico verso ${apartment || 'destinazione'}`;
      }
    }
    
    batch.set(transRef, txData);

    await executeWrite(batch.commit());
    invalidateCache();
  } catch (error) {
    return formatError(error, 'create', 'transactions (batch)');
  }
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  invalidateCache();
  try {
    const txRef = doc(db, 'transactions', id);
    await executeWrite(updateDoc(txRef, {
      ...updates,
    }));
  } catch (error) {
    return formatError(error, 'update', `transactions/${id}`);
  }
}

export async function getRestockOrders(): Promise<RestockOrder[]> {
  try {
    const q = query(collection(db, 'restockOrders'), orderBy('createdAt', 'desc'));
    const snapshot = await executeRead(getDocs(q), 15000, 'getRestockOrders');
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        orderNumber: data.orderNumber,
        property: data.property,
        requestedBy: data.requestedBy,
        items: data.items || [],
        status: data.status,
        totalCost: data.totalCost,
        createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Date ? data.createdAt : new Date()),
        purchasedAt: data.purchasedAt?.toDate?.() || (data.purchasedAt instanceof Date ? data.purchasedAt : undefined),
        fulfilledAt: data.fulfilledAt?.toDate?.() || (data.fulfilledAt instanceof Date ? data.fulfilledAt : undefined),
      } as RestockOrder;
    });
  } catch (error) {
    return formatError(error, 'list', 'restockOrders');
  }
}

export async function updateRestockOrder(orderId: string, items: RestockOrderItem[], property?: string): Promise<void> {
  try {
    const reqRef = doc(db, 'restockOrders', orderId);
    const updates: any = { items };
    if (property) {
      updates.property = property;
    }
    await executeWrite(updateDoc(reqRef, updates));
  } catch (error) {
    return formatError(error, 'update', `restockOrders/${orderId}`);
  }
}

export async function deleteRestockOrder(orderId: string): Promise<void> {
  try {
    const reqRef = doc(db, 'restockOrders', orderId);
    const orderSnap = await getDocFromServer(reqRef);
    if (!orderSnap.exists()) return;
    
    const orderData = orderSnap.data();
    
    if (orderData.status === 'fulfilled') {
      const batch = writeBatch(db);
      const items = orderData.items || [];
      const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';

      for (const orderItem of items) {
         if (orderItem.isPurchased && orderItem.quantityDelivered && orderItem.quantityDelivered > 0) {
            const itemRef = doc(db, 'items', orderItem.itemId);
            const itemSnap = await getDocFromServer(itemRef);
            if (itemSnap.exists()) {
               const itemData = itemSnap.data();
               const newQuantity = Math.max(0, (itemData.quantity || 0) - orderItem.quantityDelivered);
               batch.update(itemRef, {
                 quantity: newQuantity,
                 updatedAt: serverTimestamp()
               });

               const transRef = doc(collection(db, 'transactions'));
               batch.set(transRef, {
                 itemId: orderItem.itemId,
                 itemName: orderItem.itemName,
                 type: 'out',
                 quantity: orderItem.quantityDelivered,
                 date: serverTimestamp(),
                 userId: auth.currentUser?.uid || '',
                 operator: currentOperator,
                 notes: `Storno annullamento ordine errato (${orderData.orderNumber || orderId})`
               });
            }
         }
      }
      batch.delete(reqRef);
      await executeWrite(batch.commit());
    } else {
      await executeWrite(deleteDoc(reqRef));
    }
  } catch (error) {
    return formatError(error, 'delete', `restockOrders/${orderId}`);
  }
}

export async function addRestockOrder(items: RestockOrderItem[], property?: string): Promise<string> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const orderNumber = `ORD-${new Date().getTime().toString().slice(-6)}`;
    
    const docData: any = {
      orderNumber,
      requestedBy: currentOperator,
      items,
      status: 'pending',
      createdAt: serverTimestamp()
    };
    if (property) {
      docData.property = property;
    }
    
    console.log("Sending order:", docData);

    const docRef = doc(collection(db, 'restockOrders'));
    await executeWrite(setDoc(docRef, docData));
    return docRef.id;
  } catch (error) {
    return formatError(error, 'create', 'restockOrders') as any;
  }
}

export async function purchaseRestockOrder(orderId: string, updatedItems: RestockOrderItem[], totalCost?: number): Promise<void> {
  try {
    const reqRef = doc(db, 'restockOrders', orderId);
    const payload: any = {
      status: 'purchased',
      items: updatedItems,
      purchasedAt: serverTimestamp()
    };
    if (totalCost !== undefined) {
      payload.totalCost = totalCost;
    }
    await executeWrite(updateDoc(reqRef, payload));
  } catch (error) {
    return formatError(error, 'update', `restockOrders/${orderId}`);
  }
}

export async function updateRestockOrderDate(orderId: string, newDate: Date): Promise<void> {
  try {
    const reqRef = doc(db, 'restockOrders', orderId);
    await executeWrite(updateDoc(reqRef, {
      createdAt: newDate
    }));
  } catch (error) {
    return formatError(error, 'update', `restockOrders/${orderId}`);
  }
}

export async function fulfillRestockOrder(orderId: string, items: RestockOrderItem[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    
    const reqRef = doc(db, 'restockOrders', orderId);
    batch.update(reqRef, {
      items: items,
      status: 'fulfilled',
      fulfilledAt: serverTimestamp()
    });

    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore (Acquisti)';

    for (const orderItem of items) {
      if (orderItem.isPurchased && orderItem.quantityDelivered && orderItem.quantityDelivered > 0) {
        const itemRef = doc(db, 'items', orderItem.itemId);
        // Getting each item - better to use caching or assume they still exist
        const itemSnap = await getDocFromServer(itemRef);
        if (itemSnap.exists()) {
          const itemData = itemSnap.data();
          const newQuantity = (itemData.quantity || 0) + orderItem.quantityDelivered;
          
          const updatePayload: any = {
            quantity: newQuantity,
            updatedAt: serverTimestamp()
          };
          
          if (orderItem.unitPrice !== undefined) {
            updatePayload.price = orderItem.unitPrice;
          }
          
          batch.update(itemRef, updatePayload);

          const transRef = doc(collection(db, 'transactions'));
          
          batch.set(transRef, {
            itemId: orderItem.itemId,
            itemName: orderItem.itemName,
            type: 'in',
            quantity: orderItem.quantityDelivered,
            date: serverTimestamp(),
            userId: auth.currentUser?.uid || '',
            operator: currentOperator,
            notes: "Ricezione da ordine magazzino"
          });
        }
      }
    }

    await executeWrite(batch.commit());
  } catch (error) {
    return formatError(error, 'update', `restockOrders/${orderId}`);
  }
}

export async function getCashflows(startDate?: Date, endDate?: Date): Promise<Cashflow[]> {
  try {
    let q = query(collection(db, 'cashflows'), orderBy('date', 'desc'));
    // Potentially in the future add where clauses for dates
    const snapshot = await executeRead(getDocs(q), 15000, 'getCashflows');
    
    let results = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        property: data.property,
        apartment: data.apartment,
        date: data.date?.toDate?.() || (data.date instanceof Date ? data.date : new Date()),
        type: data.type,
        category: data.category,
        amount: data.amount,
        description: data.description,
        receiptUrl: data.receiptUrl,
        operator: data.operator,
        isLiquidation: data.isLiquidation,
        createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Date ? data.createdAt : new Date()),
        updatedAt: data.updatedAt?.toDate?.() || (data.updatedAt instanceof Date ? data.updatedAt : new Date()),
        itemId: data.itemId,
        itemQuantity: data.itemQuantity,
        items: data.items,
      } as Cashflow;
    });

    if (startDate) {
      results = results.filter(r => r.date >= startDate);
    }
    if (endDate) {
      results = results.filter(r => r.date <= endDate);
    }

    return results;
  } catch (error) {
    return formatError(error, 'list', 'cashflows');
  }
}

// --- Work Activities API ---
export async function getWorkActivitiesByLiquidationId(liquidationId: string): Promise<WorkActivity[]> {
  try {
    const q = query(collection(db, 'work_activities'), where('liquidationId', '==', liquidationId));
    const querySnapshot = await executeRead(getDocs(q), 10000, 'work_activities');
    return querySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      date: doc.data().date.toDate(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as WorkActivity[];
  } catch (error) {
    return formatError(error, 'list', 'work_activities');
  }
}

export async function getWorkActivities(startDate?: Date, endDate?: Date): Promise<WorkActivity[]> {
  try {
    let q = query(collection(db, 'work_activities'), orderBy('date', 'desc'));
    
    if (startDate && endDate) {
       q = query(collection(db, 'work_activities'), 
          where('date', '>=', startDate),
          where('date', '<=', endDate),
          orderBy('date', 'desc')
       );
    }
    const snapshot = await executeRead(getDocs(q), 15000, 'getWorkActivities');
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date: data.date?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as WorkActivity;
    });
  } catch (error) {
    return formatError(error, 'read', 'work_activities');
  }
}

export async function addWorkActivity(activity: Omit<WorkActivity, 'id' | 'createdAt' | 'updatedAt' | 'operator'>): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const docRef = doc(collection(db, 'work_activities'));
    await executeWrite(setDoc(docRef, {
      ...activity,
      date: Timestamp.fromDate(activity.date),
      operator: currentOperator,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  } catch (error) {
    return formatError(error, 'create', 'work_activities');
  }
}

export async function updateWorkActivity(id: string, updates: Partial<WorkActivity>, original: WorkActivity): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    await executeWrite(updateDoc(doc(db, 'work_activities', id), {
      ...updates,
      ...(updates.date ? { date: Timestamp.fromDate(updates.date) } : {}),
      updatedAt: serverTimestamp(),
      ...(original.operator ? {} : { operator: currentOperator }),
      ...(original.createdAt ? {} : { createdAt: serverTimestamp() }),
      ...(original.amount !== undefined ? {} : { amount: updates.amount !== undefined ? updates.amount : 0 }),
      ...(original.apartment !== undefined ? {} : { apartment: updates.apartment !== undefined ? updates.apartment : '' })
    }));
  } catch (error) {
    return formatError(error, 'update', 'work_activities');
  }
}

export async function unliquidateWorkActivity(id: string, original: WorkActivity): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    await executeWrite(updateDoc(doc(db, 'work_activities', id), {
      status: 'pending',
      liquidationId: deleteField(),
      updatedAt: serverTimestamp(),
      ...(original.operator ? {} : { operator: currentOperator }),
      ...(original.createdAt ? {} : { createdAt: serverTimestamp() }),
      ...(original.amount !== undefined ? {} : { amount: 0 }),
      ...(original.apartment !== undefined ? {} : { apartment: '' })
    }));
  } catch (error) {
    return formatError(error, 'update', 'work_activities');
  }
}

export async function deleteLiquidationCashflow(id: string): Promise<{ activitiesReverted: number }> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const q = query(collection(db, 'work_activities'), where('liquidationId', '==', id));
    const qs = await executeRead(getDocs(q), 10000, 'delete_cashflow');
    const batch = writeBatch(db);
    
    qs.forEach(d => {
      batch.update(d.ref, {
        status: 'pending',
        liquidationId: deleteField(),
        updatedAt: serverTimestamp(),
        // For backwards compatibility on old documents that might miss these fields:
        ...(d.data().operator ? {} : { operator: currentOperator }),
        ...(d.data().createdAt ? {} : { createdAt: serverTimestamp() }),
        ...(d.data().amount !== undefined ? {} : { amount: 0 }),
        ...(d.data().apartment !== undefined ? {} : { apartment: '' })
      });
    });
    
    batch.delete(doc(db, 'cashflows', id));

    const logRef = doc(collection(db, 'cashflowLogs'));
    batch.set(logRef, {
      cashflowId: id,
      action: 'delete',
      modifiedBy: currentOperator,
      modifiedById: auth.currentUser?.uid || '',
      timestamp: serverTimestamp(),
      changes: `Liquidazione eliminata con storno di ${qs.docs.length} attività`
    });

    await executeWrite(batch.commit());
    return { activitiesReverted: qs.docs.length };
  } catch (error) {
    throw formatError(error, 'delete', 'cashflows');
  }
}

export async function deleteWorkActivity(id: string): Promise<void> {
  try {
      logAudit('DELETE', 'work_activities', id, 'Deleted work activity');
  await executeWrite(deleteDoc(doc(db, 'work_activities', id)));
  } catch (error) {
    return formatError(error, 'delete', 'work_activities');
  }
}

export async function liquidateWorkActivities(
  liquidations: { workIds: string[], activities: WorkActivity[], expenseDetails: Omit<Cashflow, 'id' | 'createdAt' | 'updatedAt' | 'operator'> }[]
): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const batch = writeBatch(db);

    for (const liq of liquidations) {
      const expenseRef = doc(collection(db, 'cashflows'));
      batch.set(expenseRef, {
        ...liq.expenseDetails,
        operator: currentOperator,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      for (const act of liq.activities) {
        const workRef = doc(db, 'work_activities', act.id);
        batch.update(workRef, {
          status: 'liquidated',
          liquidationId: expenseRef.id,
          updatedAt: serverTimestamp(),
          ...(act.operator ? {} : { operator: currentOperator }),
          ...(act.createdAt ? {} : { createdAt: serverTimestamp() }),
          ...(act.amount !== undefined ? {} : { amount: 0 }),
          ...(act.apartment !== undefined ? {} : { apartment: '' })
        });
      }
    }

    await executeWrite(batch.commit());
  } catch (error) {
    return formatError(error, 'update', 'work_activities (liquidation)');
  }
}

// --- End Work Activities API ---

export async function addCashflow(cashflow: Omit<Cashflow, 'id' | 'createdAt' | 'updatedAt' | 'operator'>): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const batch = writeBatch(db);

    const cashflowRef = doc(collection(db, 'cashflows'));
    batch.set(cashflowRef, {
      ...cashflow,
      date: Timestamp.fromDate(cashflow.date),
      operator: currentOperator,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (cashflow.items && cashflow.items.length > 0 && cashflow.type === 'income') {
      for (const it of cashflow.items) {
        if (it.quantity > 0) {
          const itemRef = doc(db, 'items', it.itemId);
          const itemSnap = await getDocFromServer(itemRef);
          if (itemSnap.exists()) {
            const itemData = itemSnap.data();
            const newQuantity = Math.max(0, (itemData.quantity || 0) - it.quantity);
            
            batch.update(itemRef, {
              quantity: newQuantity,
              updatedAt: serverTimestamp()
            });

            const transRef = doc(collection(db, 'transactions'));
            let txData: any = {
              itemId: it.itemId,
              itemName: itemData.name || 'Articolo Sconosciuto',
              type: 'out',
              quantity: it.quantity,
              property: itemData.property,
              apartment: cashflow.apartment,
              date: serverTimestamp(),
              userId: auth.currentUser?.uid || '',
              operator: currentOperator,
              notes: `Vendita: ${cashflow.description || ''}`
            };
            batch.set(transRef, txData);
          }
        }
      }
    } else if (cashflow.itemId && cashflow.itemQuantity && cashflow.itemQuantity > 0 && cashflow.type === 'income') {
      const itemRef = doc(db, 'items', cashflow.itemId);
      const itemSnap = await getDocFromServer(itemRef);
      if (itemSnap.exists()) {
        const itemData = itemSnap.data();
        const newQuantity = Math.max(0, (itemData.quantity || 0) - cashflow.itemQuantity);
        
        batch.update(itemRef, {
          quantity: newQuantity,
          updatedAt: serverTimestamp()
        });

        const transRef = doc(collection(db, 'transactions'));
        let txData: any = {
          itemId: cashflow.itemId,
          itemName: itemData.name || 'Articolo Sconosciuto',
          type: 'out',
          quantity: cashflow.itemQuantity,
          property: itemData.property,
          apartment: cashflow.apartment,
          date: serverTimestamp(),
          userId: auth.currentUser?.uid || '',
          operator: currentOperator,
          notes: `Vendita: ${cashflow.description || ''}`
        };
        batch.set(transRef, txData);
      }
    }

    const logRef = doc(collection(db, 'cashflowLogs'));
    batch.set(logRef, {
      cashflowId: cashflowRef.id,
      action: 'create',
      modifiedBy: currentOperator,
      modifiedById: auth.currentUser?.uid || '',
      timestamp: serverTimestamp(),
      changes: 'Transazione creata'
    });

    await executeWrite(batch.commit());
    logAudit('CREATE', 'cashflows', cashflowRef.id, cashflow);
  } catch (error) {
    return formatError(error, 'create', 'cashflows');
  }
}

export async function updateCashflow(id: string, updates: Partial<Cashflow>, original: Cashflow): Promise<void> {
  try {
    const batch = writeBatch(db);
    const cashflowRef = doc(db, 'cashflows', id);
    
    // Fetch current data to detect missing fields that the UI might have polyfilled
    const docSnap = await getDocFromServer(cashflowRef);
    const existingData = docSnap.exists() ? docSnap.data() : null;
    
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    batch.update(cashflowRef, {
      ...updates,
      ...(updates.date ? { date: Timestamp.fromDate(updates.date) } : {}),
      updatedAt: serverTimestamp(),
      ...(existingData && existingData.operator ? {} : { operator: currentOperator }),
      ...(existingData && existingData.createdAt ? {} : { createdAt: serverTimestamp() })
    });
    const logRef = doc(collection(db, 'cashflowLogs'));
    
    // Determine what changed for the log
    const changedFields = Object.entries(updates)
       .filter(([k, v]) => JSON.stringify((original as any)[k]) !== JSON.stringify(v))
       .map(([k, v]) => {
         if (k === 'receiptUrl') {
            return `receiptUrl: ${original.receiptUrl ? '[IMMAGINE ESISTENTE]' : '[NESSUNA IMMAGINE]'} -> ${v ? '[NUOVA IMMAGINE]' : '[NESSUNA IMMAGINE]'}`;
         }
         return `${k}: ${(original as any)[k]} -> ${v}`;
       })
       .join('; ');

    const finalChangesString = changedFields.length > 4900 ? changedFields.substring(0, 4900) + '...' : (changedFields || 'Nessuna modifica rilevata');

    batch.set(logRef, {
      cashflowId: id,
      action: 'update',
      modifiedBy: currentOperator,
      modifiedById: auth.currentUser?.uid || '',
      timestamp: serverTimestamp(),
      changes: finalChangesString
    });

    await executeWrite(batch.commit());
    logAudit('UPDATE', 'cashflows', id, updates);
  } catch (error) {
    return formatError(error, 'update', `cashflows/${id}`);
  }
}

export async function getCashflowLogs(cashflowId?: string): Promise<CashflowLog[]> {
  try {
    const logsRef = collection(db, 'cashflowLogs');
    const q = cashflowId 
       ? query(logsRef, where('cashflowId', '==', cashflowId), orderBy('timestamp', 'desc'))
       : query(logsRef, orderBy('timestamp', 'desc'));

    const snapshot = await executeRead(getDocs(q), 15000, 'getCashflowLogs');
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() || new Date(),
      } as unknown as CashflowLog;
    });
  } catch(error) {
    return formatError(error, 'list', 'cashflowLogs') as any;
  }
}

export async function deleteCashflow(id: string): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const cashflowRef = doc(db, 'cashflows', id);
    const cfSnap = await getDocFromServer(cashflowRef);
    
    const batch = writeBatch(db);

    if (cfSnap.exists()) {
      const data = cfSnap.data();
      // Se è un incasso e ha items, ripristiniamo le quantità
      if (data.type === 'income' && data.category === 'Vendita Vino') {
        const itemsToRestore = data.items || (data.itemId ? [{ itemId: data.itemId, quantity: data.itemQuantity || 1 }] : []);
        
        for (const it of itemsToRestore) {
          if (it.quantity > 0) {
             const itemRef = doc(db, 'items', it.itemId);
             const itemSnap = await getDocFromServer(itemRef);
             if (itemSnap.exists()) {
                const itemData = itemSnap.data();
                batch.update(itemRef, {
                   quantity: (itemData.quantity || 0) + it.quantity,
                   updatedAt: serverTimestamp()
                });
                
                const transRef = doc(collection(db, 'transactions'));
                batch.set(transRef, {
                   itemId: it.itemId,
                   itemName: itemData.name || 'Articolo Sconosciuto',
                   type: 'in',
                   quantity: it.quantity,
                   property: itemData.property,
                   apartment: data.apartment || '',
                   date: serverTimestamp(),
                   userId: auth.currentUser?.uid || '',
                   operator: currentOperator,
                   notes: `Annullamento vendita: storno incasso eliminato`
                });
             }
          }
        }
      }
    }
    
    batch.delete(cashflowRef);

    const logRef = doc(collection(db, 'cashflowLogs'));
    batch.set(logRef, {
      cashflowId: id,
      action: 'delete',
      modifiedBy: currentOperator,
      modifiedById: auth.currentUser?.uid || '',
      timestamp: serverTimestamp(),
      changes: 'Transazione eliminata'
    });

    await executeWrite(batch.commit());
    logAudit('DELETE', 'cashflows', id, 'Deleted cashflow');
  } catch (error) {
    return formatError(error, 'delete', `cashflows/${id}`);
  }
}

export interface AppSettings {
  properties: string[];
  apartments: string[];
  propertyApartments: Record<string, string[]>;
  apartmentProperty: Record<string, string>;
  incomeCategories: string[];
  expenseCategories: string[];
  workCategories: string[];
}

export const updateAppSettings = async (newSettings: Partial<AppSettings>): Promise<void> => {
  try {
    const docRef = doc(db, 'settings', 'global');
    await executeWrite(setDoc(docRef, {
      ...newSettings,
      updatedAt: serverTimestamp(),
    }, { merge: true }));
  } catch (error) {
    formatError(error, 'write', 'settings/global');
  }
};

export async function getCatalogItems(): Promise<CatalogItem[]> {
  try {
    const q = query(collection(db, 'catalogItems'), orderBy('name', 'asc'));
    const snapshot = await executeRead(getDocs(q), 15000, 'getCatalogItems');
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        category: data.category,
        unit: data.unit || 'pz',
        barcode: data.barcode,
        imageUrl: data.imageUrl,
        createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Date ? data.createdAt : new Date()),
        updatedAt: data.updatedAt?.toDate?.() || (data.updatedAt instanceof Date ? data.updatedAt : new Date()),
      } as CatalogItem;
    });
  } catch (error) {
    return formatError(error, 'list', 'catalogItems');
  }
}

export async function addCatalogItem(item: Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docData: any = {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const docRef = doc(collection(db, 'catalogItems'));
    await executeWrite(setDoc(docRef, docData));
    return docRef.id;
  } catch (error) {
    return formatError(error, 'create', 'catalogItems') as any;
  }
}

export async function updateCatalogItem(id: string, updates: Partial<Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  try {
    const payload = {
      ...updates,
      updatedAt: serverTimestamp()
    };
    await executeWrite(updateDoc(doc(db, 'catalogItems', id), payload));
  } catch (error) {
    return formatError(error, 'update', `catalogItems/${id}`);
  }
}

export async function deleteCatalogItem(id: string): Promise<void> {
  try {
    await executeWrite(deleteDoc(doc(db, 'catalogItems', id)));
  } catch (error) {
    return formatError(error, 'delete', `catalogItems/${id}`);
  }
}

export async function getCatalogItemByBarcode(barcode: string): Promise<CatalogItem | null> {
  try {
    const q = query(collection(db, 'catalogItems'), where('barcode', '==', barcode), limit(1));
    const snapshot = await executeRead(getDocs(q), 15000, 'getCatalogItemByBarcode');
    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data();
    return {
      id: snapshot.docs[0].id,
      name: data.name,
      category: data.category,
      unit: data.unit || 'pz',
      barcode: data.barcode,
      imageUrl: data.imageUrl,
      createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Date ? data.createdAt : new Date()),
      updatedAt: data.updatedAt?.toDate?.() || (data.updatedAt instanceof Date ? data.updatedAt : new Date()),
    } as CatalogItem;
  } catch (error) {
    console.error("Error fetching catalog item by barcode:", error);
    return null;
  }
}

export async function importCatalogFromItems(adminUid: string): Promise<number> {
  // Checks admin auth implicitly via rules, or backend script logic in secure env
  try {
    const qItems = query(collection(db, 'items'));
    const itemsSnap = await executeRead(getDocs(qItems), 15000, 'import_catalog');
    
    const qCatalog = query(collection(db, 'catalogItems'));
    const catalogSnap = await executeRead(getDocs(qCatalog), 15000, 'import_catalog');
    
    // Create an exact match lookup by name (case-insensitive ideally, but exact for simplicity)
    const existingCatalogNames = new Set(
      catalogSnap.docs.map(d => d.data().name?.trim().toLowerCase())
    );
    
    let addedCount = 0;
    
    let currentBatch = writeBatch(db);
    let opCount = 0;
    
    // Process in batches of 500 max writes
    for (const itemDoc of itemsSnap.docs) {
      const data = itemDoc.data();
      const normalizeName = data.name?.trim().toLowerCase();
      
      if (!normalizeName || existingCatalogNames.has(normalizeName)) {
        continue;
      }
      
      // Found a new item, add to catalog batch
      const newRef = doc(collection(db, 'catalogItems'));
      
      // We must avoid setting undefined explicitly to unsupported fields in batch
      const cleanData: any = {
        name: data.name?.trim(),
        category: data.category || 'Varie',
        unit: data.unit || 'pz',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (data.barcode) cleanData.barcode = data.barcode;
      if (data.imageUrl) cleanData.imageUrl = data.imageUrl;

      currentBatch.set(newRef, cleanData);

      existingCatalogNames.add(normalizeName);
      addedCount++;
      opCount++;

      if (opCount >= 490) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    }
    
    if (opCount > 0) {
      await currentBatch.commit();
    }
    
    return addedCount;
  } catch (error) {
    formatError(error, 'write', 'catalogItems (import)');
    return 0; // fallback in case formatError is caught
  }
}

// --- Parking Reservations API ---

export async function getParkingReservations(): Promise<ParkingReservation[]> {
  try {
    const reservationsCol = collection(db, 'parking_reservations');
    const q = query(reservationsCol, orderBy('startDate', 'asc'));
    const snapshot = await executeRead(getDocs(q), 15000, 'getParkingReservations');
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      startDate: doc.data().startDate.toDate(),
      endDate: doc.data().endDate.toDate(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date()
    })) as ParkingReservation[];
  } catch (error) {
    return formatError(error, 'read', 'parking_reservations');
  }
}

export async function addParkingReservation(reservation: Omit<ParkingReservation, 'id' | 'createdAt' | 'updatedAt' | 'operator'>): Promise<void> {
  try {
    const currentOperator = auth.currentUser?.displayName || auth.currentUser?.email || 'Operatore';
    const reservationsCol = collection(db, 'parking_reservations');
    const docRef = doc(reservationsCol);
    await executeWrite(setDoc(docRef, {
      ...reservation,
      startDate: Timestamp.fromDate(reservation.startDate),
      endDate: Timestamp.fromDate(reservation.endDate),
      operator: currentOperator,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  } catch (error) {
    return formatError(error, 'create', 'parking_reservations');
  }
}

export async function updateParkingReservation(id: string, updates: Partial<ParkingReservation>): Promise<void> {
  try {
    const docRef = doc(db, 'parking_reservations', id);
    await executeWrite(updateDoc(docRef, {
      ...updates,
      ...(updates.startDate ? { startDate: Timestamp.fromDate(updates.startDate) } : {}),
      ...(updates.endDate ? { endDate: Timestamp.fromDate(updates.endDate) } : {}),
      updatedAt: serverTimestamp()
    }));
  } catch (error) {
    return formatError(error, 'update', 'parking_reservations');
  }
}

export async function deleteParkingReservation(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'parking_reservations', id);
    await executeWrite(deleteDoc(docRef));
  } catch (error) {
    return formatError(error, 'delete', 'parking_reservations');
  }
}

// --- End Parking Reservations API ---
