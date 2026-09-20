const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// 1. CONFIGURAZIONE CORS COMPLETA
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());

// 2. INIZIALIZZAZIONE SICURA DI FIREBASE ADMIN
const privateKey = process.env.PRIVATE_KEY
  ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

if (!privateKey) {
  console.warn("⚠️ ATTENZIONE: process.env.PRIVATE_KEY non è definita!");
}

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.PROJECT_ID || 'nomescuola-bar-app',
      clientEmail: process.env.CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
  console.log('✅ Firebase Admin SDK inizializzato con successo.');
} catch (error) {
  console.error('❌ Errore inizializzazione Firebase Admin:', error.message);
}

const db = admin.firestore();

// 3. LISTENER IN TEMPO REALE SU FIRESTORE
console.log('📡 Server avviato, in ascolto sulle modifiche degli ordini...');

db.collection('ordini').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    // Intercettiamo solo le modifiche agli ordini esistenti
    if (change.type === 'modified') {
      const ordine = change.doc.data();

      if (ordine.stato === 'pronto' && ordine.email) {
        console.log(`🔔 Ordine pronto per: ${ordine.email}`);

        try {
          // Recuperiamo il documento dell'utente usando la sua email come ID
          const userDoc = await db.collection('users').doc(ordine.email).get();
          const fcmToken = userDoc.data()?.fcmToken;

          if (fcmToken) {
            // Invio notifica FCM
            const message = {
              token: fcmToken,
              notification: {
                title: '🍔 Ordine Pronto!',
                body: 'Il tuo ordine è pronto al ritiro al bar!',
              },
              webpush: {
                notification: {
                  title: '🍔 Ordine Pronto!',
                  body: 'Il tuo ordine è pronto al ritiro al bar!',
                  icon: '/logo.png'
                }
              }
            };

            await admin.messaging().send(message);
            console.log(`✅ Notifica inviata con successo a ${ordine.email}`);
          } else {
            console.log(`⚠️ Nessun fcmToken trovato nella collezione 'users' per ${ordine.email}`);
          }
        } catch (e) {
          console.error('❌ Errore durante l\'invio della notifica:', e);
        }
      }
    }
  });
});

// 4. ROTTE DI CONTROLLO H24 (Health check per cron-job.org)
app.get('/', (req, res) => {
  res.status(200).send('Server notifiche attivo e in ascolto su Firestore ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server in ascolto sulla porta ${PORT}`));
