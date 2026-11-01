import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: isIOS ? persistentSingleTabManager({ forceOwnership: false }) : undefined
  }),
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
