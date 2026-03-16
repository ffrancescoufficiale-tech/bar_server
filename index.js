const admin = require('firebase-admin');
const express = require('express');
const app = express();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.PROJECT_ID,
    clientEmail: process.env.CLIENT_EMAIL,
    privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = admin.firestore();

console.log('Server avviato, ascolto ordini...');

db.collection('ordini').onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === 'modified') {
      const ordine = change.doc.data();
      
      if (ordine.stato === 'pronto' && ordine.email) {
        console.log(`Ordine pronto per: ${ordine.email}`);
        try {
          const userDoc = await db.collection('users').doc(ordine.email).get();
          const fcmToken = userDoc.data()?.fcmToken;
          
          if (fcmToken) {
            await admin.messaging().send({
              token: fcmToken,
              notification: {
                title: '🍔 Ordine Pronto!',
                body: 'Il tuo ordine è pronto al ritiro!',
              },
            });
            console.log(`Notifica inviata a ${ordine.email}`);
          } else {
            console.log(`Nessun token per ${ordine.email}`);
          }
        } catch (e) {
          console.error('Errore invio notifica:', e);
        }
      }
    }
  });
});

app.get('/', (req, res) => res.send('Server notifiche attivo ✅'));
app.listen(process.env.PORT || 3000, () => console.log('Server in ascolto'));
