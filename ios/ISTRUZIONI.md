# Fidelity Cards — app iOS

Progetto Xcode generato con Capacitor 6. Serve un **Mac con Xcode** e un **account Apple Developer** (99 €/anno).

## Passi
1. Sul Mac: installa Xcode (App Store) e CocoaPods (`sudo gem install cocoapods`).
2. Apri il Terminale nella cartella `ios/App` ed esegui `pod install`.
3. Apri `ios/App/App.xcworkspace` con Xcode (NON il file .xcodeproj).
4. Seleziona il target **App** → scheda *Signing & Capabilities* → spunta *Automatically manage signing* e scegli il tuo **Team** (account Apple Developer). Bundle ID: `com.bpcall.fideltycards` (cambialo se già usato).
5. Prova sul tuo iPhone: collegalo via cavo, selezionalo in alto in Xcode e premi ▶ (Run).
6. Pubblicazione: menu *Product → Archive* → *Distribute App* → **TestFlight** (distribuzione a tester tramite link/QR) oppure **App Store Connect** (pubblicazione sullo Store, con revisione Apple).

## Aggiornare l'app quando cambia il sito
Dalla cartella del repo: `npm run ios:open` (ricompila la web app, sincronizza `ios/App/App/public` e apre Xcode), poi ripeti Archive.

## Note
- L'app carica il frontend incluso (cartella `App/App/public`) e parla con Firebase (`fidelitycards-d8c56`) via internet.
- Permessi già configurati in `Info.plist`: fotocamera (scanner QR) e rete locale (stampante Epson).
- Scheda di stampa Epson ePOS: telefono e stampante devono essere sulla stessa rete Wi‑Fi.
