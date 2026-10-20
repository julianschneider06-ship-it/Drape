# Security- und Rechte-Backlog

Bewusst zurückgestellt, bis der Kern fertig ist (Phase 7). Neue Punkte hier ergänzen.

- Row Level Security in Supabase für alle Tabellen mit Nutzerdaten prüfen und aktivieren
- Vercel-Zugriffsschutz (SSO) für den Launch abschalten bzw. bewusst konfigurieren
- Rechtliche Prüfung des Scrapings (Zalando u. a.), Bildrechte, Affiliate-Alternativen
- Datenschutz: Datenschutzerklärung, Cookie-Hinweis, Löschung von Nutzerdaten
- Rate Limiting für Endpunkte, die Kosten verursachen (KI-Klassifizierung)
- Gemini-API-Schlüssel (`GEMINI_API_KEY` in Vercel) neu erzeugen und ersetzen: Er wurde im Chat eingefügt und liegt dort im Verlauf
- Supabase: Die Pipeline-Tabellen haben RLS ohne Policies (nur Service-Rolle schreibt/liest). Später prüfen, ob für `/sample` und den Feed gezielte Lese-Policies oder ein eigener Lese-Pfad nötig sind
- Supabase: Bereits vorhandene Funktion `public.rls_auto_enable()` ist für anon/authenticated ausführbar (Advisor-Warnung, nicht von uns angelegt) – Rechte entziehen
- Pipeline-Zugang: Edge Function `pipeline` ist mit einem geteilten Token (Tabelle `pipeline_tokens` (nur Hash)) geschützt; vor dem Launch rotieren und durch den echten Supabase-Secret-Key oder Cron-Jobs ersetzen
- Rechte: Eigene Kopien der Produktbilder speichern (Supabase Storage / eigenes Bucket) statt Hotlinking von Shop-CDNs; Bildrechte und Lizenzen klären (relevant für Freisteller/Regeneration)
- Pipeline-Token der Web-App ist nur lesend (`vercel-*`); der KI-Job läuft ausschließlich als Batch-Skript außerhalb des Webs. Gemini-Key vor Launch rotieren und nur als Secret im Job-Runner halten
- Supabase-MCP hängt bei destruktiven SQL-Befehlen (DROP/DELETE/TRUNCATE, vermutlich Freigabe-Prompt); Aufräumen von Altdaten (400 versteckte Produkte) später gezielt freigeben
- Feed-Prototyp (Schritt 3): Anonyme Geräte-ID (UUID in localStorage + Cookie, `drape_device`) ist ein personenbezogenes Kennzeichen: Einwilligung/Cookie-Hinweis, Löschung auf Anfrage (Likes + Events per device_id), Aufbewahrungsfristen für den Event-Log festlegen
- Öffentliche Schreib-Endpunkte `/api/events` und `/api/likes`: keine Authentifizierung, Geräte-IDs sind fälschbar (Likes/Events fremder Geräte schreibbar, wenn die UUID bekannt ist). Später an Login binden (Schritt 5), Events serverseitig signieren oder Session-Token verwenden
- Rate Limiting der API-Routen ist nur In-Memory pro Serverinstanz (best effort). Vor dem Launch: gemeinsames Limit (Edge/KV/Vercel Firewall), Bot-Schutz, Größenlimits prüfen; Event-Spam/Poisoning erkennen (zu viele Events pro Gerät, unmögliche Dwell-Zeiten)
- Der Web-Token (`DRAPE_PIPELINE_TOKEN` in Vercel) darf nur `feed_list`, `likes_list`, `like_set`, `events_append`, `review_list`, `sample`; trotzdem vor dem Launch rotieren und auf einen echten, eng gefassten Datenbank-Zugang (eigene Rolle) umstellen; `/review` und `/sample` sind noch öffentlich lesbar (interne Seiten schützen)
- Produktbilder werden direkt von den Shop-CDNs geladen (Hotlinking, Rechte, Verfügbarkeit): eigene Kopien in eigenem Storage (siehe oben)
