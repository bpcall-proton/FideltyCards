# Fedeltà Codici — Punti e Consumazioni

Sistema di loyalty a **codici monouso**: l'admin genera lotti di codici (numerici, alfanumerici, QR), li stampa e li distribuisce; lo studente li digita o scansiona nell'app e il **backend** decide il valore (punti, consumazioni, bonus, promozione), marca il codice come `USED` e registra la transazione.

## Avvio

```bash
npm install
npm run dev        # http://localhost:8080
```

Senza variabili d'ambiente l'app gira in **modalità demo** (dati in localStorage, selettore utente admin/studente in alto a destra).

Per il backend reale, crea `.env` da `.env.example` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e applica la migrazione `supabase/migrations/0001_codes_system.sql` al progetto Supabase. Imposta `role = 'admin'` nella tabella `profiles` per gli account amministratore.

## Sicurezza (riassunto)

- Il client invia solo `redeem_code(codice)`: valore, limiti e scadenze vengono letti dal database.
- `redeem_code` blocca la riga con `FOR UPDATE` e aggiorna con `WHERE status = 'ACTIVE'`: con due richieste simultanee una sola ottiene i punti, l'altra riceve `ALREADY_USED`.
- I codici non vengono mai cancellati: stati `ACTIVE / USED / EXPIRED / CANCELLED` + storico in `code_transactions` (indice univoco per codice).
- RLS: gli studenti non possono leggere la tabella `codes`; generazione e disattivazione sono funzioni `SECURITY DEFINER` riservate agli admin.
- Codici generati con CSPRNG (`gen_random_bytes`), mai sequenziali.
