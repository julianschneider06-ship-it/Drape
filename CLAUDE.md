# Drape – Arbeitsregeln für Claude

Drape ist eine personalisierte Fashion-Discovery-Website: ein vertikal scrollbarer Feed aus Outfits (TikTok-Prinzip), in dem einzelne Produkte angetippt, geliked und gesammelt werden. Mobil zuerst, minimalistisch, weißer Hintergrund. Kein klassischer Online-Shop.

Der Nutzer hat keine Coding-Erfahrung. Er steuert das gesamte Projekt über Claude (Chat und Claude Code). Antworten an ihn: Deutsch, einfache Worte, kurz.

## Grundsätze (Priorität in dieser Reihenfolge)

1. **Schneller Fortschritt zuerst.** Geradeaus denken, nicht über Randfälle grübeln, nicht an jeder Stelle absichern. Lieber etwas Lauffähiges liefern und danach verbessern.
2. **Security und Rechte sind vorerst zurückgestellt.** Sie kommen am Ende des Projekts. Bis dahin auf das Minimum reduzieren: keine Härtung, keine Angriffsszenarien, keine Rechtsprüfung (Scraping-Rechte, Datenschutz, Lizenzen), keine Rückfragen dazu. Ausnahmen, die keinen Aufwand kosten und immer gelten:
   - Geheime Schlüssel (Supabase `service_role`/secret key, API-Schlüssel kostenpflichtiger Dienste) kommen **nie** ins Git-Repo und **nie** in Browser-Code. Sie liegen nur als Umgebungsvariablen in Vercel bzw. Supabase.
   - Alles, was Geld kostet (kostenpflichtige KI-Aufrufe, Supabase-Upgrades, Domains), darf nicht öffentlich auslösbar sein.
   - Aufgeschobene Security-Themen werden in `docs/security-backlog.md` notiert, damit sie am Ende nicht vergessen werden.
3. **Claude erledigt alles selbst.** Der Nutzer soll nie selbst auf Vercel, GitHub oder Supabase arbeiten müssen. Fehlt eine Berechtigung, Verbindung oder Einstellung, sofort anfragen und direkt ändern, nicht auf den Nutzer abwälzen. Nur wenn es technisch unmöglich ist (z. B. Konto anlegen, Zahlung freigeben), dem Nutzer den kürzesten Weg nennen.
4. **Probleme nicht nur flicken.** Bei jedem Fehler zuerst die Ursache recherchieren (Logs, Dokumentation, Websuche), dann erklären, was los ist, dann beheben und, soweit möglich, die Ursache so verbessern, dass das Problem nicht wiederkommt. Immer aus eigener Initiative den nächsten sinnvollen Schritt vorschlagen, nicht warten.
5. **Blockaden nicht umgehen.** Wird etwas durch eine Richtlinie des Systems abgelehnt (403 vom Proxy, gesperrte Domain), nicht mit Tricks umgehen, sondern melden und einen legitimen Weg vorschlagen.

## Technik

- **Stack:** Next.js (App Router, TypeScript, Tailwind), Supabase (Postgres, Login), Vercel (Hosting), GitHub (Code). Später als PWA für den iPhone-Homescreen.
- **Deployment:** Push auf `main` deployt automatisch über Vercel.
- **Datenmodell-Prinzip:** Produkte sind die Objekte, die Nutzer liken und speichern. Outfits werden aus Produkten zusammengesetzt und **nicht** als eigene Einheit gespeichert.
- **Kein Dislike.** Personalisierung lernt aus Onboarding (Stilrichtungen), Likes und impliziten Signalen (Weiterscrollen, Verweildauer, Antippen).
- **Produktklassifizierung:** Stil ist eine Kombination von Eigenschaften, nie eine einzelne Kategorie.
- **Mobil zuerst.** Jede Oberfläche zuerst für ein Smartphone-Display bauen, dann für größere Bildschirme.

## Phasenplan

1. Setup: Repo, Vercel, Supabase verbunden, leere App live
2. Feed mit Testdaten (ca. 100 Produkte), vertikaler Outfit-Feed, Produkt antippen, Like
3. Onboarding (Stilauswahl), Login, „Meine Sammlung“
4. Produktklassifizierung per KI aus dem Produktbild
5. Outfit-Logik und Personalisierung
6. Scraping echter Produktdaten (z. B. Zalando)
7. Security und Rechte

## Arbeitsweise in Claude Code

- Commit-Nachrichten kurz auf Deutsch oder Englisch, ein Commit pro abgeschlossenem Schritt.
- Nach jedem Schritt prüfen, ob der Vercel-Build grün ist, bevor etwas als fertig gemeldet wird.
- Neue Bibliotheken dürfen ohne Rückfrage hinzugefügt werden, wenn sie dem Fortschritt dienen.
- Am Ende jeder Antwort in einem Satz sagen, was als Nächstes dran ist.
