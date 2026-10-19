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
