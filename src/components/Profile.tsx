import React, { useState } from 'react';
import { auth } from '../firebase/config';
import { updatePassword } from 'firebase/auth';
import { useAuthContext } from './Auth';
import { KeyRound, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

export function Profile() {
  const { user, isAdmin } = useAuthContext();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('La password deve essere di almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le password non coincidono.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setSuccess('Password aggiornata con successo! Userai questa nuova password al prossimo accesso.');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (e: any) {
      if (e.code === 'auth/requires-recent-login') {
         setError('Per motivi di sicurezza, devi effettuare nuovamente l\'accesso per poter cambiare la password.');
      } else {
         setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Il Tuo Profilo</h2>
        <p className="text-sm text-gray-500">Gestisci le impostazioni del tuo account.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
           <div className="flex items-center gap-4">
             <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
               {user.email?.charAt(0).toUpperCase()}
             </div>
             <div>
               <h3 className="font-semibold text-lg text-gray-900">{user.email}</h3>
               <div className="flex items-center gap-2 mt-1">
                 {isAdmin ? (
                   <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1 rounded-md">
                     <ShieldCheck size={14} /> Amministratore
                   </span>
                 ) : (
                   <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2.5 py-1 rounded-md">
                     Operatore Autorizzato
                   </span>
                 )}
               </div>
             </div>
           </div>
        </div>

        <div className="p-6 bg-gray-50/50">
          <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
            <KeyRound size={18} className="text-gray-500"/> Modifica Password di Accesso
          </h4>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl flex items-center gap-3">
              <CheckCircle2 size={20} className="shrink-0" />
              <p className="text-sm font-medium">{success}</p>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuova Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conferma Nuova Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
               type="submit"
               disabled={loading}
               className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition disabled:opacity-50"
            >
              {loading ? 'Aggiornamento...' : 'Aggiorna Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
