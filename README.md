# Shah Medicare Centre & Hospital — Website

Website for **Dr. Nishant Girishkumar Shah, MRCPUK (Medicine), Physician**, Shah Medicare Centre & Hospital, Ahmedabad.

- **Home** (`index.html`) and **Contact** (`contact.html`) are **static** HTML pages.
- The **appointment form** is the only dynamic feature: JavaScript → PHP → MySQL.
- The database stores **only appointment form submissions**. No CMS, no framework.

Built with HTML5, CSS3, vanilla JavaScript, PHP 8.x and MySQL/MariaDB.

---

## Folder structure

```
shah-medicare/
├── index.html            Home page (static)
├── contact.html          Contact page (static, includes the same form)
├── css/style.css         All styles. Colours/fonts are CSS variables at the top (section 1. TOKENS)
├── js/main.js            Menu, scroll effects, tabs, gallery lightbox, testimonial slider, map
├── js/appointment.js     Appointment form: AppointmentService (API) + AppointmentForm (UI)
├── api/
│   ├── config.php        ← DATABASE CREDENTIALS GO HERE
│   ├── appointment.php   Receives the form, validates, saves to MySQL
│   ├── .htaccess         Blocks direct access to config and logs
│   └── logs/             Private error log (api-error.log), blocked from the web
├── assets/images/        Photos (WebP + JPG, several sizes)
├── assets/icons/         favicon.svg, logo.svg
├── database.sql          Creates the database + table
├── .htaccess             Security headers, caching, blocks .sql/.md files
└── README.md
```

---

## 1. Create the MySQL database

**Local (XAMPP):** start **Apache** and **MySQL** in the XAMPP Control Panel.

**Live hosting (cPanel):** open **MySQL® Databases** and:
1. Create a database (cPanel usually prefixes it, e.g. `youraccount_medical_clinic`).
2. Create a database user with a strong password.
3. Add the user to the database. **SELECT** and **INSERT** privileges are enough for the website.

## 2. Import `database.sql`

1. Open **phpMyAdmin** (local: http://localhost/phpmyadmin).
2. **Local:** click **Import** at the top → choose `database.sql` → **Go**. This creates the `medical_clinic` database and the `appointments` table.
3. **Shared hosting:** select *your* database in the left sidebar first. Then open `database.sql` in a text editor and delete the two lines marked `-- (A)` (`CREATE DATABASE…` and `USE…`), because most hosts don't allow them. Then click **Import** → **Go**.

Or from a terminal:
```bash
mysql -u root -p < database.sql
```

## 3. Enter the database credentials

Edit **`api/config.php`**, section 1:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'medical_clinic');        // or youraccount_medical_clinic
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');
```

Also change `IP_HASH_SALT` to any long random string.

- For **local XAMPP** the default user is `root` with an empty password.
- The credentials live only on the server. They are never sent to the browser, `config.php` refuses direct requests, and `.htaccess` blocks it.
- Optional: put the same `define(...)` lines in `api/config.local.php` instead. That file overrides `config.php` and is handy for keeping local and live settings apart.

## 4. How the form works

```
Visitor fills the form  (index.html / contact.html)
   │  js/appointment.js validates: required fields, phone, email, date not in past, consent
   ▼
fetch() POST JSON  →  api/appointment.php
   │  checks POST only, same-site origin, honeypot, too-fast submissions, rate limit
   │  validates + sanitises every field again
   │  saves the row with PDO prepared statements
   ▼
MySQL: appointments table  →  returns reference  APPT-YYYYMMDD-XXXX
   ▼
Success message with the reference, no page reload; form resets
```

Anti-spam measures:
- **Honeypot:** a hidden "website" field. Bots that fill it get a fake success and nothing is saved.
- **Time check:** submissions faster than 2.5 seconds are rejected.
- **Rate limit:** max 5 requests per hour per visitor, tracked with a salted hash (the real IP is never stored).

Errors are written to `api/logs/api-error.log`. Visitors only ever see a friendly message, never database details.

Clinic contact details (phone, WhatsApp, email) are shown next to the form as alternatives.

## 5. Where submissions are stored

Database **`medical_clinic`** → table **`appointments`**.

| Column | Meaning |
|---|---|
| `appointment_id` | Reference given to the patient, e.g. `APPT-20260923-CU4S` |
| `full_name`, `phone`, `email` | Patient contact details |
| `appointment_date`, `appointment_time` | Preferred date and time of day (Morning / Afternoon / Evening) |
| `appointment_type`, `patient_type` | What the visit is for; new or existing patient |
| `message` | Reason for visit (optional) |
| `status` | `New` by default. Change to `Contacted`, `Confirmed`, `Completed`, `Cancelled` or `Spam` |
| `created_at` | When the request was submitted (India time) |

## 6. View submissions in phpMyAdmin

1. Open phpMyAdmin → click **`medical_clinic`** in the left sidebar → click **`appointments`**.
2. Click **Browse**. Each row is one request, and the newest is at the bottom (click the `created_at` column header to sort).
3. To update a request, double-click the **status** cell and choose e.g. `Contacted`.

Useful queries (**SQL** tab):
```sql
-- New requests, newest first
SELECT appointment_id, full_name, phone, appointment_date, appointment_time, appointment_type, created_at
FROM appointments WHERE status = 'New' ORDER BY created_at DESC;

-- Mark one as contacted
UPDATE appointments SET status = 'Contacted' WHERE appointment_id = 'APPT-20260923-CU4S';
```

## 7. Deploy the website

**Local (XAMPP):** copy the `shah-medicare` folder into `C:\xampp\htdocs\`, then open http://localhost/shah-medicare/.

**Live hosting:**
1. Upload **everything inside** `shah-medicare/` to `public_html/` (or a subfolder) via File Manager or FTP.
2. Import the database (steps 1–2) and edit `api/config.php` (step 3).
3. Delete `api/config.local.php` if it was uploaded.
4. Make sure `api/logs/` is writable by PHP (permission `755` or `775`).
5. Replace `https://www.example.com/` with the real domain in both HTML files. It appears in `<link rel="canonical">`, the `og:` / `twitter:` tags and the JSON-LD blocks.
6. After SSL is active, uncomment the HTTPS redirect at the bottom of `.htaccess`.
7. Test the form (step 9).

Requirements: PHP 8.1+ with `pdo_mysql`, MySQL 5.7+ or MariaDB 10.3+.

## 8. Replace placeholder content / images

**Testimonials:** in `index.html`, search for `PATIENT TESTIMONIALS`. Replace each `[bracketed]` text with a real testimonial the patient has approved, and remove the `class="ph"` attribute from those spans. The dashed gold underline marks placeholders. Add or remove `<figure class="t-slide">` blocks as needed; the dots and counter update automatically. Don't publish invented testimonials.

**Emergency wording:** in `contact.html`, search for `REPLACE: add the clinic's approved emergency wording`.

**Contact details** are already filled in (phone +91 89805 34718, email drnishantsmch@gmail.com, address and timings). To change them, use find & replace in both HTML files:
- Phone display `+91 89805 34718`, links `tel:+918980534718`
- WhatsApp `https://wa.me/918980534718` (assumed to be the same number as the phone; change it if WhatsApp uses a different one)
- Email `drnishantsmch@gmail.com`
- Also update `"telephone"`, `"email"`, `"address"` and opening hours in the JSON-LD `<script>` near the top of each page.

**Images** (`assets/images/`): to swap a photo, keep the same file name, or update the `src`, `srcset` and `<source>` paths. Each image has a `.webp` (used first) and a `.jpg` fallback.
- `dr-shah-portrait-*` — hero · `dr-shah-consulting-*` — About · `dr-shah-desk-*` — consultation section
- `reception-1/2`, `consultation`, `room-1…4`, `doctor-standing`, `doctor-desk-wide` — gallery and other sections
- Room, reception and consultation photos were cropped out of WhatsApp screenshots, so they're small (≈350–730px wide). Please send the **original camera files** and swap them in for sharper results.

**Logo:** the "SH" monogram is a temporary SVG. To use the official logo, replace the `<svg class="brand__mark">` blocks in the header and footer with `<img src="assets/icons/your-logo.svg" alt="" class="brand__mark">`, and update `assets/icons/favicon.svg`.

**Colours / fonts:** edit the variables in section **1. TOKENS** at the top of `css/style.css`, e.g. `--c-green-800` or `--c-gold-400`.

**Conditions list:** the heart-related conditions (arrhythmia, heart failure, coronary artery disease, valvular disease, preventive cardiology) were added from the design brief. Please confirm with Dr. Shah that each is appropriate, and edit or delete cards in the `CONDITIONS` section of `index.html` if not.

## 9. Test the appointment form

1. Open the site, scroll to **Request an appointment**, click **Request Appointment** without filling anything. Inline errors should appear.
2. Fill the required fields with a future date, wait a few seconds, and submit. You should see *"Your appointment request has been received"* with a reference like `APPT-20260923-XXXX`.
3. In phpMyAdmin → `medical_clinic` → `appointments` → **Browse**, the new row should be there with status `New`.
4. Delete test rows before going live:
   ```sql
   DELETE FROM appointments WHERE full_name LIKE '%Test%';
   ```
5. If submission fails, check `api/logs/api-error.log`. The most common cause is wrong credentials in `api/config.php`.

Note: submitting more than 5 times in an hour from the same connection is blocked by the rate limit. Wait, or delete your test rows.

## 10. Replace the API endpoint later

The frontend talks only to the URL in the form's `data-endpoint` attribute:

```html
<form ... data-appointment-form data-endpoint="api/appointment.php">
```

To move to another backend (a CRM, a different server, a serverless function):
1. Change `data-endpoint` in both `index.html` and `contact.html`.
2. The new endpoint must accept a `POST` with a JSON body containing `full_name, phone, email, appointment_date, appointment_time, appointment_type, patient_type, message, consent, website, elapsed_ms`.
3. It must respond with JSON: `{ "success": true, "data": { "appointment_id": "…" } }`, or `{ "success": false, "message": "…", "errors": { "field": "message" } }`.
4. For a different domain, add your site's origin to `ALLOWED_ORIGINS` (in `config.php` if still PHP) or enable CORS on the new service.

All network code is in `AppointmentService` in `js/appointment.js`: `save()`, `getStatus()` and `handleResponse()`. The UI code (`AppointmentForm`) doesn't need to change.

`getStatus(appointmentId, phone)` is available for a future "check my request" feature. It returns the status only when the reference and phone number match.

---

## Accessibility, performance & SEO notes

- Semantic landmarks, one `<h1>` per page, labelled form fields with inline errors announced to screen readers.
- Keyboard support: skip link, focus-trapped mobile menu and lightbox (Esc closes), arrow keys in tabs, lightbox and slider.
- `prefers-reduced-motion` turns off all animation.
- Responsive WebP images with JPG fallback, lazy loading below the fold, hero image preloaded; no animation libraries.
- The Google map loads only when the visitor clicks **Show map** (faster pages, better privacy).
- Meta description, canonical, Open Graph, Twitter cards, and JSON-LD for `MedicalClinic`, `Person` (physician credential), `ContactPage` and `BreadcrumbList`.
