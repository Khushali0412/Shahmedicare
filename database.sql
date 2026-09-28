-- ============================================================================
--  Shah Medicare Centre & Hospital — appointment requests
--  MySQL 5.7+ / MariaDB 10.3+
--
--  The database stores ONLY appointment form submissions.
--
--  Shared hosting note: if your host does not allow CREATE DATABASE, create the
--  database in cPanel first, select it in phpMyAdmin, and import this file with
--  the two lines marked (A) removed or commented out.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `medical_clinic`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;   -- (A)
USE `medical_clinic`;                                  -- (A)

CREATE TABLE IF NOT EXISTS `appointments` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `appointment_id`   VARCHAR(20)   NOT NULL COMMENT 'Public reference, APPT-YYYYMMDD-XXXX',
  `full_name`        VARCHAR(100)  NOT NULL,
  `phone`            VARCHAR(20)   NOT NULL,
  `email`            VARCHAR(150)  NULL DEFAULT NULL,
  `appointment_date` DATE          NOT NULL COMMENT 'Preferred date requested by the patient',
  `appointment_time` VARCHAR(20)   NOT NULL COMMENT 'Morning / Afternoon / Evening',
  `appointment_type` VARCHAR(50)   NOT NULL,
  `patient_type`     VARCHAR(20)   NULL DEFAULT NULL COMMENT 'New Patient / Existing Patient',
  `message`          TEXT          NULL,
  `consent`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT 'Patient agreed to be contacted',
  `ip_hash`          CHAR(64)      NULL DEFAULT NULL COMMENT 'Salted SHA-256 of visitor IP (rate limiting only)',
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `status`           ENUM('New','Contacted','Confirmed','Completed','Cancelled','Spam')
                                   NOT NULL DEFAULT 'New',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_appointment_id` (`appointment_id`),
  KEY `idx_status_created` (`status`, `created_at`),
  KEY `idx_appointment_date` (`appointment_date`),
  KEY `idx_ip_created` (`ip_hash`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- OPTIONAL (recommended): a restricted database user for the website.
-- Run as an admin, change the password, then put these credentials in
-- api/config.php. On cPanel, create the user via "MySQL Databases" instead.
-- ----------------------------------------------------------------------------
-- CREATE USER 'medical_clinic_app'@'localhost' IDENTIFIED BY 'CHANGE-THIS-PASSWORD';
-- GRANT SELECT, INSERT ON `medical_clinic`.`appointments` TO 'medical_clinic_app'@'localhost';
-- FLUSH PRIVILEGES;

-- ----------------------------------------------------------------------------
-- Handy queries for the clinic team (phpMyAdmin → SQL tab)
-- ----------------------------------------------------------------------------
-- New requests, newest first:
--   SELECT appointment_id, full_name, phone, appointment_date, appointment_time, appointment_type, created_at
--   FROM appointments WHERE status = 'New' ORDER BY created_at DESC;
-- Mark a request as contacted:
--   UPDATE appointments SET status = 'Contacted' WHERE appointment_id = 'APPT-20260101-AB12';
