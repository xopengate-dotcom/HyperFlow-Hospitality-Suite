import React, { useState, useEffect, createContext, useContext } from 'react';
import { auth, db } from '../firebase/config';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { executeRead } from '../firebase/api';
import { PackageOpen, Loader2 } from 'lucide-react';
import { HyperFlowLogo } from './HyperFlowLogo';
import { logger } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  hideFinancials: boolean;
  role?: 'magazzino' | 'acquisti' | 'admin';
  permissions?: Record<string, boolean>;
}

export const AuthContext = createContext<AuthContextType>({ user: null, isAdmin: false, hideFinancials: false, permissions: {} });

export function useAuthContext() {
  return useContext(AuthContext);
}

export function Auth({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(true);
  
  // Permissions state
  const [isAdmin, setIsAdmin] = useState(false);
  const [hideFinancials, setHideFinancials] = useState(false);
  const [role, setRole] = useState<'magazzino' | 'acquisti' | 'admin' | undefined>(undefined);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        if (u.email?.toLowerCase() === 'xopengate@gmail.com' || u.email?.toLowerCase() === 'x.opengate@gmail.com') {
          setIsAuthorized(true);
          setIsAdmin(true);
          setRole('admin');
          setHideFinancials(false);
          setPermissions({ dashboard: true, inventory: true, orders: true, history: true, cashflow: true, cashflowEdit: true, reports: true, properties: true });
        } else {
          try {
             // Reset state
            setIsAdmin(false);
            setRole(undefined);
            setHideFinancials(false);
            setPermissions({});

            const [opDoc, admDoc] = await Promise.all([
              executeRead(getDoc(doc(db, 'operators', u.uid)), 10000, 'auth_operator'),
              executeRead(getDoc(doc(db, 'admins', u.uid)), 10000, 'auth_admin')
            ]);

            if (admDoc.exists()) {
              setIsAdmin(true);
              setRole('admin');
              setPermissions({ dashboard: true, inventory: true, orders: true, history: true, cashflow: true, cashflowEdit: true, reports: true, properties: true });
            }
            if (opDoc.exists()) {
               const data = opDoc.data();
               if (data.hideFinancials === true) {
                 setHideFinancials(true);
               }
               if (data.isAdmin === true) {
                 setIsAdmin(true);
               }
               if (data.role) {
                 setRole(data.role);
               }
               if (data.permissions) {
                 setPermissions(data.permissions);
               } else {
                 setPermissions({ dashboard: true, inventory: true, orders: true, history: true, cashflow: true, cashflowEdit: false, reports: true, properties: false });
               }
            }

            setIsAuthorized(opDoc.exists() || admDoc.exists());
            logger.info('Auth', `Authorization successful for ${u.email}. Admin: ${admDoc.exists()}, Operator: ${opDoc.exists()}`);
          } catch (e) {
            logger.error('Auth', 'Error checking authorization for user', e);
            setIsAuthorized(false);
          }
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loginWithGoogle = async () => {
    try {
      setError('');
      setLoginLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const loginWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      setLoginLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      if (e.code === 'auth/invalid-credential') {
        setError('Credenziali errate o utente non trovato.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-8 text-center space-y-8">
            <div 
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-sm border border-gray-100 mb-4 cursor-pointer"
              onDoubleClick={loginWithGoogle}
              title="Doppio clic per accesso amministratore"
            >
              <HyperFlowLogo size={56} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">HyperFlow Hospitality Suite</h1>
              <p className="text-gray-500">Accesso Area Operatori & Gestione</p>
            </div>
            
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={loginWithEmail} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="La tua email operatore"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loginLoading ? <Loader2 size={20} className="animate-spin" /> : 'Accedi'}
                </button>
              </div>
            </form>
            
            {/* The secret admin login is triggered by double clicking the logo */}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="flex justify-center"><HyperFlowLogo size={64} /></div>
          <h1 className="text-xl font-bold text-gray-900">Accesso Negato</h1>
          <p className="text-gray-600">L'utente <strong>{user.email}</strong> non è autorizzato ad accedere al magazzino. Chiedi all'amministratore di aggiungerti agli operatori.</p>
          <button 
             onClick={() => auth.signOut()}
             className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Esci
          </button>
        </div>
      </div>
     )
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, hideFinancials, role, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}
