import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { firebaseConfig } from '../config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// Server time offset for corrected clock (milliseconds to add to Date.now())
export let serverTimeOffset = 0;

onValue(ref(rtdb, '.info/serverTimeOffset'), snap => {
  serverTimeOffset = snap.val() ?? 0;
});

export const serverNow = () => Date.now() + serverTimeOffset;
