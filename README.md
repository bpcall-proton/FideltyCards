# Fedeltà Codici — Punti e Consumazioni

Sistema di loyalty a **codici monouso**: l'admin genera lotti di codici (numerici, alfanumerici, QR), li stampa e li distribuisce; lo studente li digita o scansiona nell'app e il **backend (Firebase Cloud Functions)** decide il valore (punti, consumazioni, bonus, promozione), marca il codice come `USED` e registra la transazione.

## Avvio

```bash
npm install
npm run dev        # http://localhost:8080
```

Senza variabili d'ambiente l'app gira in **modalità demo** (dati in localStorage, selettore utente admin/studente in alto a destra).

## Backend Firebase

1. Crea un progetto Firebase con **Authentication (Email/Password)**, **Firestore** e **Cloud Functions** (piano Blaze).
2. `npm i -g firebase-tools && firebase login && firebase use <project-id>`
3. `cd functions && npm install && cd ..`
4. `firebase deploy --only firestore,functions` (regole, indici e funzioni in `europe-west1`).
5. Crea `.env` da `.env.example` con `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (da Project settings → Web app).
6. Registra l'utente admin dall'app, poi in Firestore imposta `profiles/{uid}.role = "admin"`.
7. Frontend: `npm run build && firebase deploy --only hosting`.

Sviluppo locale con emulatori: `cd functions && npm run serve`.

### Struttura Firestore

| Collezione | Contenuto | Accesso client |
|---|---|---|
| `profiles/{uid}` | nome, `role`, `level` | proprio profilo (ruolo/livello non modificabili) |
| `lots/{id}` | lotto: nome, tipo/valore, formato, scadenze, limiti, contatori | solo admin, sola lettura |
| `codes/{CODICE}` | l'ID documento **è il codice** → univocità garantita; `status`, `usedBy`, `usedAt`, `transactionId` | solo admin, sola lettura |
| `transactions/{n}` | storico immutabile (codice, studente, lotto, punti, quantità, device, data) | admin / proprio studente |
| `counters/{uid}` | saldo punti e contatori prodotto (`points`, `CAFFE`, …) | proprio, sola lettura |
| `goals`, `rewards`, `notifications` | obiettivi, premi sbloccati, notifiche admin | vedi `firestore.rules` |

Tutte le scritture su lotti/codici/transazioni/contatori passano **esclusivamente** dalle Cloud Functions (`functions/src/index.ts`):
`generateCodeLot`, `redeemCode`, `cancelCode`, `cancelLot`, `cancelPromotion`, `redeemReward`, `lotStats`.

## Sicurezza (riassunto)

- Il client invia solo `redeemCode({ code })`: valore, limiti e scadenze vengono letti dal lotto lato server.
- `redeemCode` esegue lettura e cambio stato `ACTIVE → USED` in **un'unica transazione Firestore**: con due richieste simultanee una sola ottiene i punti, l'altra riceve `ALREADY_USED`.
- I codici non vengono mai cancellati: stati `ACTIVE / USED / EXPIRED / CANCELLED` + storico in `transactions` con numero progressivo.
- Le regole Firestore negano ogni scrittura client su codici/lotti/transazioni/contatori; gli studenti non possono leggere `codes`.
- Codici generati con CSPRNG (`crypto.randomBytes`), mai sequenziali; la lunghezza minima è vincolata alla quantità richiesta.

## App mobile (Capacitor)

La web app è impacchettata con [Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, cartelle `android/` e `ios/`).

### Android (APK)
Requisiti: JDK 17, Android SDK (platform 34, build-tools 34).
```bash
npm run android:apk   # → android/app/build/outputs/apk/debug/app-debug.apk
```
Per il Play Store: creare un keystore e configurare `signingConfigs.release` in `android/app/build.gradle`, poi `./gradlew bundleRelease`.

### iOS
Serve un Mac con Xcode e un account Apple Developer.
```bash
npm run ios:open      # apre ios/App/App.xcworkspace in Xcode
```
In Xcode: Signing & Capabilities → seleziona il Team → Product → Archive → Distribute (TestFlight / App Store).
