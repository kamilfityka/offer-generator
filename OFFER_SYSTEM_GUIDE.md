# System Ofertowy – Implementation Guide

## Presenton + Raynet CRM + Claude + PDF

Dokument przeznaczony dla zespołu developerskiego. Opisuje **architekturę, zakres prac, modele danych, API oraz kolejność wdrożenia**.

### Stack Technologiczny

* **Raynet CRM** (Źródło danych o klientach)
* **Claude AI** (Strukturyzacja treści oferty)
* **PostgreSQL** (Baza danych systemowych i cache)
* **Gotenberg** (Konwersja HTML → PDF)

---

## 1. Cel systemu

Celem jest stworzenie **centralnego modułu ofertowego**, który:

* Pobiera klientów i kontakty z Raynet CRM.
* Umożliwia tworzenie ofert na podstawie tych danych.
* Zapisuje snapshot danych klienta w ofercie (niezmienność historyczna).
* Generuje PDF oferty przy użyciu AI i szablonów HTML.
* Umożliwia przegląd i zarządzanie ofertami w jednym panelu.

> **Ważne:** System nie zastępuje CRM, tylko z niego korzysta w trybie odczytu.

---

## 2. Architektura wysokiego poziomu

1. **Frontend:** Presenton UI
2. **Backend API:** Presenton (Node.js/Python/Go)
3. **Integracje zewnętrzne:** Raynet CRM (Read-only), Claude API (LLM)
4. **Generowanie dokumentów:** HTML Templates + Gotenberg
5. **Storage:** PDF + Pliki źródłowe (S3 lub lokalnie)

---

## 3. Integracja z Raynet CRM

### 3.1 Charakter integracji

* Tryb **read-only**.
* Brak zapisu danych zwrotnych do CRM.
* Dane klientów są cache'owane lokalnie dla wydajności i stabilności.

### 3.2 Zakres danych

* **Firma (Company):** ID (Raynet), Nazwa, NIP, Adres.
* **Osoba kontaktowa (Contact):** ID (Raynet), Imię, Nazwisko, Telefon, Email.

### 3.3 Lokalne tabele cache CRM

```sql
CREATE TABLE crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raynet_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  nip TEXT,
  address TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raynet_id TEXT UNIQUE NOT NULL,
  company_id UUID REFERENCES crm_companies(id),
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## 4. Moduł Ofert – Model Danych

### 4.1 Tabela `offers`

```sql
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Snapshot klienta (dane zamrożone w momencie wystawienia)
  company_name TEXT NOT NULL,
  company_nip TEXT,
  company_address TEXT,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  -- Dane oferty
  title TEXT NOT NULL,
  valid_until DATE,
  description_file_path TEXT,

  status TEXT CHECK (status IN (
    'draft',
    'generated',
    'sent',
    'accepted',
    'expired'
  )) DEFAULT 'draft',

  document_id UUID REFERENCES documents(id),

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**Uwaga:** Snapshot danych jest obowiązkowy – oferta jest dokumentem handlowym i nie może się zmieniać, gdy klient zmieni dane w CRM.

---

## 5. Flow tworzenia oferty

1. **Wybór klienta:** Frontend pobiera firmy z `/api/crm/companies`. Po wyborze firmy pobierane są przypisane kontakty: `/api/crm/companies/:id/contacts`.
2. **Formularz oferty:** Użytkownik uzupełnia tytuł, datę ważności, ewentualną korektę danych oraz wgrywa plik z opisem.
3. **Zapis:** System wykonuje snapshot danych klienta i zapisuje ofertę ze statusem `draft`.

---

## 6. Obsługa plików

* **Format:** `.txt` lub `.md`.
* **Storage:** `/uploads/offers/offer_<offer_id>.txt`.
* **Baza:** Pole `description_file_path` przechowuje ścieżkę do pliku źródłowego, na bazie którego AI wygeneruje treść.

---

## 7. Generowanie oferty (AI + PDF)

### 7.1 Pipeline

1. Odczyt pliku tekstowego.
2. **Claude Opus:** Strukturyzacja treści wg wytycznych.
3. Wstrzyknięcie treści do **HTML Template**.
4. **Gotenberg:** Konwersja HTML do PDF.
5. Aktualizacja rekordu `offers` o `document_id` i status `generated`.

### 7.2 Prompt Systemowy (Skrót)

```text
SYSTEM: You are a senior sales consultant.
USER: Generate a professional commercial offer in Polish.
DATA:
- Company: {{company_name}} (NIP: {{company_nip}})
- Contact: {{contact_first_name}} {{contact_last_name}}
- Description: {{uploaded_text}}
- Validity: {{valid_until}}
```

---

## 8. HTML Template

System korzysta ze sztywnych szablonów, aby zapewnić spójność wizualną. AI generuje jedynie tekst sekcji merytorycznych.

* **Nagłówek:** Dane firmy i klienta.
* **Body:** `{{ai_generated_content}}`.
* **Stopka:** Data ważności i dane kontaktowe.

---

## 9. API – Wymagane endpointy

| Metoda   | Endpoint                              | Opis                                    |
|----------|---------------------------------------|-----------------------------------------|
| **GET**  | `/api/crm/companies`                  | Pobieranie listy firm z cache           |
| **GET**  | `/api/crm/companies/:id/contacts`     | Pobieranie kontaktów dla firmy          |
| **POST** | `/api/offers`                         | Utworzenie nowej oferty (draft)          |
| **GET**  | `/api/offers`                         | Lista wszystkich ofert                  |
| **POST** | `/api/offers/:id/upload-description`  | Wgranie pliku źródłowego               |
| **POST** | `/api/offers/:id/generate-pdf`        | Trigger procesu AI + Gotenberg          |
| **PATCH**| `/api/offers/:id/status`              | Zmiana statusu (np. na 'sent')          |

---

## 10. Statusy oferty

* `draft`: Robocza, edytowalna.
* `generated`: PDF jest gotowy do podglądu.
* `sent`: Wysłana do klienta.
* `accepted`: Zaakceptowana przez klienta.
* `expired`: Po dacie ważności.

---

## 11. Kolejność implementacji

1. **Integracja Raynet CRM:** Mechanizm synchronizacji (cache).
2. **Baza danych:** Tabele `crm_*` oraz `offers`.
3. **API Ofert:** CRUD dla ofert i upload plików.
4. **Integracja Claude:** Logika przetwarzania tekstu.
5. **Generowanie PDF:** Gotenberg + Szablony HTML.
6. **Frontend UI:** Widoki listy, formularza i podglądu dokumentu.

---

## 12. Założenia niefunkcjonalne

* **Bezpieczeństwo:** HTTPS, autoryzacja (AuthN/AuthZ).
* **Niezawodność:** Rate limiting dla API Claude i Raynet.
* **Backup:** Regularne kopie bazy danych i plików PDF.

---

**Wniosek:** System zapewnia pełną kontrolę nad procesem ofertowania bez duplikowania funkcji CRM, wykorzystując nowoczesne narzędzia do automatyzacji powtarzalnych zadań.
