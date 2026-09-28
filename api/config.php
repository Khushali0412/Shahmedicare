<?php
/**
 * Shah Medicare — API configuration.
 *
 * ENTER YOUR DATABASE CREDENTIALS BELOW (section 1).
 * This file is never sent to the browser: it is only included by
 * api/appointment.php, refuses direct requests, and is also blocked
 * by api/.htaccess on Apache hosting.
 *
 * Optional: put overrides in api/config.local.php (same constants,
 * defined before this file's defaults) to keep secrets out of version control.
 */
declare(strict_types=1);

if (!defined('SMC_API')) {
    http_response_code(403);
    exit('Forbidden');
}

if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}

/* ---------------------------------------------------------------------------
 * 1. DATABASE — replace these values with the ones from your hosting panel.
 *    Environment variables (SMC_DB_*) take priority if your host sets them.
 * ------------------------------------------------------------------------- */
defined('DB_HOST') || define('DB_HOST', getenv('SMC_DB_HOST') ?: 'localhost');
defined('DB_PORT') || define('DB_PORT', (int) (getenv('SMC_DB_PORT') ?: 3306));
defined('DB_NAME') || define('DB_NAME', getenv('SMC_DB_NAME') ?: 'medical_clinic');
defined('DB_USER') || define('DB_USER', getenv('SMC_DB_USER') ?: 'your_database_user');
defined('DB_PASS') || define('DB_PASS', getenv('SMC_DB_PASS') !== false ? (string) getenv('SMC_DB_PASS') : 'your_database_password');

/* ---------------------------------------------------------------------------
 * 2. APPLICATION SETTINGS
 * ------------------------------------------------------------------------- */
defined('APP_TIMEZONE')      || define('APP_TIMEZONE', 'Asia/Kolkata');
defined('APP_DB_UTC_OFFSET') || define('APP_DB_UTC_OFFSET', '+05:30');

// Never set to true on a live site — it adds internal error details to API responses.
defined('APP_DEBUG') || define('APP_DEBUG', false);

// Allowed cross-origin callers. Leave empty to accept same-site requests only.
// Example: ['https://www.example.com', 'https://example.com']
defined('ALLOWED_ORIGINS') || define('ALLOWED_ORIGINS', []);

// Basic abuse protection
defined('RATE_LIMIT_MAX')    || define('RATE_LIMIT_MAX', 5);      // requests…
defined('RATE_LIMIT_WINDOW') || define('RATE_LIMIT_WINDOW', 3600); // …per this many seconds, per visitor
defined('MIN_FILL_MS')       || define('MIN_FILL_MS', 2500);      // faster than this = bot
defined('MAX_BODY_BYTES')    || define('MAX_BODY_BYTES', 16384);

// Booking window (must match js/appointment.js → AppointmentRules.maxAdvanceDays)
defined('MAX_ADVANCE_DAYS') || define('MAX_ADVANCE_DAYS', 180);

// Visitor IPs are stored only as a salted hash (for rate limiting). CHANGE THIS to a long random string.
defined('IP_HASH_SALT') || define('IP_HASH_SALT', 'change-me-to-a-long-random-string');

// Server-side error log (folder is protected by api/logs/.htaccess)
defined('LOG_FILE') || define('LOG_FILE', __DIR__ . '/logs/api-error.log');

/* ---------------------------------------------------------------------------
 * 3. HELPERS
 * ------------------------------------------------------------------------- */

/** Shared PDO connection with safe defaults. */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 5,
    ]);
    $pdo->exec("SET time_zone = '" . APP_DB_UTC_OFFSET . "'");
    return $pdo;
}

/** Append a line to the private error log. Never echoes anything to the client. */
function log_error(string $message, array $context = []): void
{
    $dir = dirname(LOG_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $line = sprintf(
        "[%s] %s %s\n",
        date('Y-m-d H:i:s'),
        $message,
        $context ? json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : ''
    );
    @error_log($line, 3, LOG_FILE);
}
