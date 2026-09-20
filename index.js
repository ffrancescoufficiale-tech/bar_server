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
app.options(/(.*)/, cors());
app.use(express.json());

// 2. RECUPERO E FORMATTAZIONE VARIABILI D'AMBIENTE
const projectId = process.env.PROJECT_ID || 'nomescuola-bar-app';
const clientEmail = process.env.CLIENT_EMAIL;

let privateKey = process.env.PRIVATE_KEY;
if (privateKey) {
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let db = null;

// 3. INIZIALIZZAZIONE SICURA DI FIREBASE ADMIN
if (!clientEmail || !privateKey) {
  console.error("❌ ERRORE CRITICO: CLIENT_EMAIL o PRIVATE_KEY non definite nelle Environment Variables!");
  console.error(" Configura le variabili d'ambiente sul tuo provider hosting prima di avviare.");
} else {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
    });
    console.log('✅ Firebase Admin SDK inizializzato con successo.');
    db = admin.firestore();

    // Avvia il listener di Firestore solo se la connessione ha avuto successo
    startFirestoreListener();
  } catch (error) {
    console.error('❌ Errore fatale durante l\'inizializzazione di Firebase Admin:', error.message);
  }
}

// 4. FUNZIONE LISTENER IN TEMPO REALE SU FIRESTORE
function startFirestoreListener() {
  if (!db) return;

  console.log('📡 Server in ascolto sulle modifiche degli ordini in tempo reale...');

  db.collection('ordini').onSnapshot((snapshot) => {
    // Gestione metadata per ignorare gli eventi iniziali se necessario
    
    snapshot.docChanges().forEach(async (change) => {
      // Intercettiamo 'modified' e 'added' per coprire anche i riavvii del server
      if (change.type === 'modified' || change.type === 'added') {
        const ordine = change.doc.data();

        // Evita l'invio multiplo controllando se la notifica è già stata processata
        if (ordine.stato === 'pronto' && ordine.email && !ordine.notificaInviata) {
          console.log(`🔔 Ordine pronto per: ${ordine.email}`);

          try {
            // Recuperiamo il documento dell'utente
            const userDoc = await db.collection('users').doc(ordine.email).get();
            const fcmToken = userDoc.data()?.fcmToken;

            if (fcmToken) {
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
                    icon: '/icons/Icon-192.png',
                    badge: '/icons/Icon-192.png',
                    click_action: '/'
                  },
                  fcmOptions: {
                    link: '/'
                  }
                },
                data: {
                  click_action: 'FLUTTER_NOTIFICATION_CLICK',
                  stato: 'pronto'
                }
              };

              await admin.messaging().send(message);
              console.log(`✅ Notifica inviata con successo a ${ordine.email}`);

              // Segna l'ordine come notificato su Firestore per evitare invii doppi
              await change.doc.ref.update({ notificaInviata: true });

            } else {
              console.log(`⚠️ Nessun fcmToken trovato nella collezione 'users' per ${ordine.email}`);
            }
          } catch (e) {
            console.error('❌ Errore durante l\'invio della notifica:', e);
          }
        }
      }
    });
  }, (error) => {
    console.error('❌ Errore nel listener di Firestore:', error.message);
  });
}

// 5. ROTTA HEALTH CHECK
app.get('/', (req, res) => {
  if (db) {
    res.status(200).send('Server notifiche attivo e connesso a Firestore ✅');
  } else {
    res.status(500).send('Server attivo ma NON connesso a Firebase. Controlla le Environment Variables ❌');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server avviato sulla porta ${PORT}`));
