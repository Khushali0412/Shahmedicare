<?php
/**
 * POST /api/appointment.php
 *
 * JSON body (Content-Type: application/json) or regular form POST.
 *
 *  action = "create" (default)  → stores a new appointment request
 *  action = "status"            → returns the status of a request
 *                                 (requires appointment_id + matching phone)
 *
 * Response: { success: bool, message: string, data?: {}, errors?: { field: msg } }
 */
declare(strict_types=1);

define('SMC_API', true);
require __DIR__ . '/config.php';

date_default_timezone_set(APP_TIMEZONE);
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');
header('Referrer-Policy: same-origin');
header('X-Robots-Tag: noindex');

/* ---------------------------------------------------------------------------
 * Response helpers
 * ------------------------------------------------------------------------- */
function respond(int $code, array $body): never
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $code, string $message, array $errors = []): never
{
    $body = ['success' => false, 'message' => $message];
    if ($errors) {
        $body['errors'] = $errors;
    }
    respond($code, $body);
}

set_exception_handler(static function (Throwable $e): void {
    log_error('Unhandled exception: ' . $e->getMessage(), ['file' => $e->getFile(), 'line' => $e->getLine()]);
    $body = ['success' => false, 'message' => 'Something went wrong on our side. Please try again later or call the clinic.'];
    if (APP_DEBUG) {
        $body['debug'] = $e->getMessage();
    }
    http_response_code(500);
    echo json_encode($body);
});

set_error_handler(static function (int $severity, string $msg, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false; // respect the @ operator
    }
    throw new ErrorException($msg, 0, $severity, $file, $line);
});

// Allowed values (mirrors js/appointment.js → AppointmentRules)
const APPOINTMENT_TYPES = ['General Consultation', 'Cardiology Consultation', 'Follow-up Consultation', 'ECG', 'Echocardiography', 'Other'];
const APPOINTMENT_TIMES = ['Morning', 'Afternoon', 'Evening'];
const PATIENT_TYPES     = ['New Patient', 'Existing Patient'];

/* ---------------------------------------------------------------------------
 * Request guards
 * ------------------------------------------------------------------------- */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    send_cors_headers();
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    fail(405, 'Method not allowed. Please submit the appointment form.');
}

send_cors_headers();
enforce_origin();

$input  = read_input();
$action = is_string($input['action'] ?? null) ? $input['action'] : 'create';

match ($action) {
    'create' => handle_create($input),
    'status' => handle_status($input),
    default  => fail(400, 'Unknown action.'),
};

/* ---------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------- */
function handle_create(array $in): never
{
    // 1. Honeypot — bots fill every field. Pretend success, store nothing.
    if (trim((string) ($in['website'] ?? '')) !== '') {
        log_error('Honeypot triggered', ['ip_hash' => substr(ip_hash(), 0, 12)]);
        respond(201, [
            'success' => true,
            'message' => 'Your appointment request has been received.',
            'data'    => ['appointment_id' => generate_reference(), 'status' => 'New'],
        ]);
    }

    // 2. Too-fast submissions (form filled in under MIN_FILL_MS)
    $elapsed = filter_var($in['elapsed_ms'] ?? null, FILTER_VALIDATE_INT);
    if ($elapsed !== false && $elapsed !== null && $elapsed < MIN_FILL_MS) {
        fail(429, 'That was quick! Please wait a moment and submit again.');
    }

    // 3. Validate & sanitise
    [$data, $errors] = validate_appointment($in);
    if ($errors) {
        fail(422, 'Please correct the highlighted fields.', $errors);
    }

    $pdo    = db();
    $ipHash = ip_hash();

    // 4. Rate limit per visitor
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM appointments WHERE ip_hash = :ip AND created_at > (NOW() - INTERVAL :win SECOND)'
    );
    $stmt->execute([':ip' => $ipHash, ':win' => RATE_LIMIT_WINDOW]);
    if ((int) $stmt->fetchColumn() >= RATE_LIMIT_MAX) {
        fail(429, 'We have received several requests from this connection. Please call or WhatsApp the clinic instead.');
    }

    // 5. Insert (retry if the random reference collides with an existing one)
    $sql = 'INSERT INTO appointments
              (appointment_id, full_name, phone, email, appointment_date, appointment_time,
               appointment_type, patient_type, message, consent, ip_hash, status)
            VALUES
              (:appointment_id, :full_name, :phone, :email, :appointment_date, :appointment_time,
               :appointment_type, :patient_type, :message, 1, :ip_hash, \'New\')';
    $insert = $pdo->prepare($sql);

    for ($attempt = 1; $attempt <= 5; $attempt++) {
        $reference = generate_reference();
        try {
            $insert->execute([
                ':appointment_id'   => $reference,
                ':full_name'        => $data['full_name'],
                ':phone'            => $data['phone'],
                ':email'            => $data['email'],
                ':appointment_date' => $data['appointment_date'],
                ':appointment_time' => $data['appointment_time'],
                ':appointment_type' => $data['appointment_type'],
                ':patient_type'     => $data['patient_type'],
                ':message'          => $data['message'],
                ':ip_hash'          => $ipHash,
            ]);
            respond(201, [
                'success' => true,
                'message' => 'Your appointment request has been received.',
                'data'    => ['appointment_id' => $reference, 'status' => 'New'],
            ]);
        } catch (PDOException $e) {
            $isDuplicate = ($e->errorInfo[1] ?? null) === 1062;
            if (!$isDuplicate || $attempt === 5) {
                throw $e;
            }
        }
    }
    fail(500, 'Could not create a reference number. Please try again.');
}

function handle_status(array $in): never
{
    $ref   = strtoupper(clean_line((string) ($in['appointment_id'] ?? ''), 20));
    $phone = normalise_phone((string) ($in['phone'] ?? ''));

    $errors = [];
    if (!preg_match('/^APPT-\d{8}-[A-Z0-9]{4}$/', $ref)) {
        $errors['appointment_id'] = 'Please enter a valid reference (e.g. APPT-20260101-AB12).';
    }
    if (!preg_match('/^\+?[0-9]{10,15}$/', $phone)) {
        $errors['phone'] = 'Please enter the phone number used for the request.';
    }
    if ($errors) {
        fail(422, 'Please check the details and try again.', $errors);
    }

    $stmt = db()->prepare(
        'SELECT appointment_id, status, appointment_date, appointment_time, appointment_type
           FROM appointments WHERE appointment_id = :ref AND phone = :phone LIMIT 1'
    );
    $stmt->execute([':ref' => $ref, ':phone' => $phone]);
    $row = $stmt->fetch();

    if (!$row) {
        fail(404, 'No request found for that reference and phone number.');
    }
    respond(200, ['success' => true, 'message' => 'Request found.', 'data' => $row]);
}

/* ---------------------------------------------------------------------------
 * Validation (mirrors js/appointment.js → AppointmentRules)
 * ------------------------------------------------------------------------- */

/** @return array{0: array<string, mixed>, 1: array<string, string>} */
function validate_appointment(array $in): array
{
    $errors = [];

    $name = clean_line((string) ($in['full_name'] ?? ''), 100);
    if ($name === '') {
        $errors['full_name'] = 'Please enter your full name.';
    } elseif (mb_strlen($name) < 2 || !preg_match("/^[\\p{L}\\p{M}][\\p{L}\\p{M}\\s.'-]{1,99}$/u", $name)) {
        $errors['full_name'] = 'Please use letters only (spaces, dots, hyphens and apostrophes are fine).';
    }

    $phone = normalise_phone((string) ($in['phone'] ?? ''));
    if ($phone === '') {
        $errors['phone'] = 'Please enter a phone number so the clinic can reach you.';
    } elseif (!preg_match('/^\+?[0-9]{10,15}$/', $phone)) {
        $errors['phone'] = 'Please enter a valid phone number (10–15 digits).';
    }

    $email = clean_line((string) ($in['email'] ?? ''), 150);
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $errors['email'] = 'Please enter a valid email address, or leave it blank.';
    }

    $dateRaw = clean_line((string) ($in['appointment_date'] ?? ''), 10);
    $date    = DateTimeImmutable::createFromFormat('!Y-m-d', $dateRaw, new DateTimeZone(APP_TIMEZONE));
    $today   = new DateTimeImmutable('today', new DateTimeZone(APP_TIMEZONE));
    if ($dateRaw === '') {
        $errors['appointment_date'] = 'Please choose a preferred date.';
    } elseif (!$date || $date->format('Y-m-d') !== $dateRaw) {
        $errors['appointment_date'] = 'Please choose a valid date.';
    } elseif ($date < $today) {
        $errors['appointment_date'] = 'The date cannot be in the past.';
    } elseif ($date > $today->modify('+' . MAX_ADVANCE_DAYS . ' days')) {
        $errors['appointment_date'] = 'Please choose a date within the next ' . MAX_ADVANCE_DAYS . ' days.';
    }

    $time = clean_line((string) ($in['appointment_time'] ?? ''), 20);
    if (!in_array($time, APPOINTMENT_TIMES, true)) {
        $errors['appointment_time'] = 'Please choose a preferred time.';
    }

    $type = clean_line((string) ($in['appointment_type'] ?? ''), 50);
    if (!in_array($type, APPOINTMENT_TYPES, true)) {
        $errors['appointment_type'] = 'Please choose an appointment type.';
    }

    $patientType = clean_line((string) ($in['patient_type'] ?? ''), 20);
    if ($patientType !== '' && !in_array($patientType, PATIENT_TYPES, true)) {
        $errors['patient_type'] = 'Please choose new or existing patient.';
    }

    $messageRaw = (string) ($in['message'] ?? '');
    $message    = clean_text($messageRaw);
    if (mb_strlen($message) > 1000) {
        $errors['message'] = 'Please keep your message under 1000 characters.';
    }

    $consent = filter_var($in['consent'] ?? false, FILTER_VALIDATE_BOOLEAN);
    if ($consent !== true) {
        $errors['consent'] = 'Please confirm that the clinic may contact you.';
    }

    return [[
        'full_name'        => $name,
        'phone'            => $phone,
        'email'            => $email !== '' ? mb_strtolower($email) : null,
        'appointment_date' => $dateRaw,
        'appointment_time' => $time,
        'appointment_type' => $type,
        'patient_type'     => $patientType !== '' ? $patientType : null,
        'message'          => $message !== '' ? $message : null,
    ], $errors];
}

/* ---------------------------------------------------------------------------
 * Utilities
 * ------------------------------------------------------------------------- */

/** Parse JSON or form-encoded body with a size cap. */
function read_input(): array
{
    $type = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_contains($type, 'application/json')) {
        $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
        if ($raw === false) {
            fail(400, 'Could not read the request.');
        }
        if (strlen($raw) > MAX_BODY_BYTES) {
            fail(413, 'The request is too large.');
        }
        try {
            $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            fail(400, 'Invalid request format.');
        }
        return is_array($data) ? $data : [];
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY_BYTES) {
        fail(413, 'The request is too large.');
    }
    return $_POST;
}

/** Single-line text: strip tags/control chars, collapse whitespace, cap length. */
function clean_line(string $value, int $max): string
{
    $value = strip_tags($value);
    $value = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value) ?? '';
    $value = preg_replace('/\s+/u', ' ', $value) ?? '';
    return mb_substr(trim($value), 0, $max);
}

/** Multi-line text: keep line breaks, strip tags and other control chars. */
function clean_text(string $value): string
{
    $value = strip_tags($value);
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    $value = preg_replace("/\n{3,}/", "\n\n", $value) ?? '';
    return trim($value);
}

function normalise_phone(string $value): string
{
    return preg_replace('/[\s().-]/', '', trim($value)) ?? '';
}

/** APPT-YYYYMMDD-XXXX (XXXX = 4 random, unambiguous characters). */
function generate_reference(): string
{
    $alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    $suffix   = '';
    for ($i = 0; $i < 4; $i++) {
        $suffix .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return 'APPT-' . date('Ymd') . '-' . $suffix;
}

function ip_hash(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return hash('sha256', IP_HASH_SALT . '|' . $ip);
}

function request_origin(): ?string
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    return $origin !== '' ? rtrim($origin, '/') : null;
}

function is_same_host(string $origin): bool
{
    $host = parse_url($origin, PHP_URL_HOST);
    $port = parse_url($origin, PHP_URL_PORT);
    $originHost = $host . ($port ? ':' . $port : '');
    return $originHost !== '' && strcasecmp($originHost, (string) ($_SERVER['HTTP_HOST'] ?? '')) === 0;
}

/** Block cross-site form posts unless the origin is explicitly allowed. */
function enforce_origin(): void
{
    $origin = request_origin();
    if ($origin === null) {
        return; // same-origin fetches may omit Origin in some browsers
    }
    if (is_same_host($origin) || in_array($origin, ALLOWED_ORIGINS, true)) {
        return;
    }
    fail(403, 'Requests from this website are not allowed.');
}

function send_cors_headers(): void
{
    $origin = request_origin();
    if ($origin !== null && in_array($origin, ALLOWED_ORIGINS, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Accept');
        header('Access-Control-Max-Age: 600');
    }
}
