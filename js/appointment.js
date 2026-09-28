/* ==========================================================================
   Appointment request — the ONLY dynamic feature of the site.

   AppointmentService  → API layer (talks only to /api/appointment.php)
   AppointmentForm     → UI layer (validation, states, success view)
   ========================================================================== */

/**
 * API layer. Knows nothing about the DOM.
 * Every method resolves to a normalised result:
 *   { ok: true,  data: {...}, message }
 *   { ok: false, status, message, errors: { field: message } }
 */
class AppointmentService {
  constructor({ endpoint = 'api/appointment.php', timeout = 15000 } = {}) {
    this.endpoint = endpoint;
    this.timeout = timeout;
  }

  /** Create a new appointment request. */
  save(payload) {
    return this.#request({ action: 'create', ...payload });
  }

  /** Look up the status of an existing request (reference + phone must match). */
  getStatus(appointmentId, phone) {
    return this.#request({ action: 'status', appointment_id: appointmentId, phone });
  }

  /** Normalise any fetch Response into the shape described above. */
  async handleResponse(response) {
    let body = null;
    try {
      body = await response.json();
    } catch (_) {
      body = null;
    }

    if (response.ok && body && body.success) {
      return { ok: true, data: body.data || {}, message: body.message || '' };
    }

    const fallback = {
      400: 'Something was wrong with the request. Please check the form and try again.',
      405: 'This request method is not allowed.',
      413: 'Your message is too long. Please shorten it and try again.',
      422: 'Please correct the highlighted fields.',
      429: 'Too many requests from this connection. Please wait a little while or call the clinic.',
    };
    return {
      ok: false,
      status: response.status,
      message: (body && body.message) || fallback[response.status] ||
        'We could not send your request right now. Please try again, or call the clinic.',
      errors: (body && body.errors) || {},
    };
  }

  async #request(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await this.handleResponse(response);
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        message: timedOut
          ? 'The request took too long. Please check your connection and try again.'
          : 'We could not reach the server. Please check your connection, or call the clinic.',
        errors: {},
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Shared rules — mirrored on the server in api/appointment.php */
const AppointmentRules = {
  maxAdvanceDays: 180,
  types: ['General Consultation', 'Cardiology Consultation', 'Follow-up Consultation', 'ECG', 'Echocardiography', 'Other'],
  times: ['Morning', 'Afternoon', 'Evening'],
  patientTypes: ['New Patient', 'Existing Patient'],
  namePattern: /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,99}$/u,
  emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  normalisePhone: (v) => String(v || '').replace(/[\s().-]/g, ''),
  phonePattern: /^\+?[0-9]{10,15}$/,
  todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },
  addDaysISO(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },
};

/** UI layer — one instance per form on the page. */
class AppointmentForm {
  constructor(form, service) {
    this.form = form;
    this.service = service;
    this.card = form.closest('.form-card');
    this.formView = this.card.querySelector('[data-form-view]');
    this.success = this.card.querySelector('[data-form-success]');
    this.status = form.querySelector('[data-form-status]');
    this.submitBtn = form.querySelector('[data-submit]');
    this.submitLabel = form.querySelector('[data-submit-label]');
    this.startedAt = performance.now();
    this.touched = new Set();
    this.busy = false;

    this.fields = {
      full_name: form.elements.full_name,
      phone: form.elements.phone,
      email: form.elements.email,
      appointment_date: form.elements.appointment_date,
      appointment_time: form.elements.appointment_time,
      appointment_type: form.elements.appointment_type,
      message: form.elements.message,
      consent: form.elements.consent,
    };

    this.#setDateBounds();
    this.#bind();
  }

  /* ---- validation ---- */
  validateField(name) {
    const R = AppointmentRules;
    const el = this.fields[name];
    if (!el) return '';
    const v = typeof el.value === 'string' ? el.value.trim() : '';

    switch (name) {
      case 'full_name':
        if (!v) return 'Please enter your full name.';
        if (v.length < 2) return 'Name looks too short.';
        if (!R.namePattern.test(v)) return 'Please use letters only (spaces, dots, hyphens and apostrophes are fine).';
        return '';
      case 'phone': {
        if (!v) return 'Please enter a phone number so the clinic can reach you.';
        if (!R.phonePattern.test(R.normalisePhone(v))) return 'Please enter a valid phone number (10–15 digits, e.g. 98765 43210).';
        return '';
      }
      case 'email':
        if (!v) return '';
        if (v.length > 150 || !R.emailPattern.test(v)) return 'Please enter a valid email address, or leave it blank.';
        return '';
      case 'appointment_date': {
        if (!v) return 'Please choose a preferred date.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Please choose a valid date.';
        if (v < R.todayISO()) return 'The date cannot be in the past.';
        if (v > R.addDaysISO(R.maxAdvanceDays)) return `Please choose a date within the next ${R.maxAdvanceDays} days.`;
        return '';
      }
      case 'appointment_time':
        if (!R.times.includes(v)) return 'Please choose a preferred time.';
        return '';
      case 'appointment_type':
        if (!R.types.includes(v)) return 'Please choose an appointment type.';
        return '';
      case 'message':
        if (v.length > 1000) return 'Please keep your message under 1000 characters.';
        return '';
      case 'consent':
        return el.checked ? '' : 'Please confirm that the clinic may contact you.';
      default:
        return '';
    }
  }

  showError(name, message) {
    const el = this.fields[name];
    if (!el) return;
    const errEl = this.form.querySelector(`#${el.id || 'f-consent'}-err`) ||
      el.closest('.field').querySelector('.field__error');
    if (message) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    if (errEl) errEl.textContent = message || '';
  }

  validateAll() {
    let firstInvalid = null;
    Object.keys(this.fields).forEach((name) => {
      const msg = this.validateField(name);
      this.showError(name, msg);
      if (msg && !firstInvalid) firstInvalid = this.fields[name];
    });
    return firstInvalid;
  }

  /* ---- data ---- */
  collect() {
    const f = this.form.elements;
    const pt = this.form.querySelector('input[name="patient_type"]:checked');
    return {
      full_name: f.full_name.value.trim(),
      phone: AppointmentRules.normalisePhone(f.phone.value.trim()),
      email: f.email.value.trim(),
      appointment_date: f.appointment_date.value,
      appointment_time: f.appointment_time.value,
      appointment_type: f.appointment_type.value,
      patient_type: pt ? pt.value : '',
      message: f.message.value.trim(),
      consent: f.consent.checked,
      website: f.website ? f.website.value : '', // honeypot
      elapsed_ms: Math.round(performance.now() - this.startedAt),
    };
  }

  /* ---- states ---- */
  setLoading(on) {
    this.busy = on;
    this.submitBtn.disabled = on;
    this.submitBtn.classList.toggle('is-loading', on);
    this.submitBtn.setAttribute('aria-busy', String(on));
    this.submitLabel.textContent = on ? 'Sending request…' : 'Request Appointment';
  }

  showSuccess(ref) {
    this.success.querySelector('[data-success-ref]').textContent = ref;
    this.formView.hidden = true;
    this.success.hidden = false;
    this.form.reset();
    this.touched.clear();
    this.#updateCounter();
    Object.keys(this.fields).forEach((n) => this.showError(n, ''));
    this.success.focus({ preventScroll: true });
    const top = this.card.getBoundingClientRect().top + window.scrollY - 100;
    if (this.card.getBoundingClientRect().top < 80) window.scrollTo({ top, behavior: 'smooth' });
  }

  reset() {
    this.success.hidden = true;
    this.formView.hidden = false;
    this.startedAt = performance.now();
    this.fields.full_name.focus();
  }

  /** Pre-fill from "Enquire" / condition buttons elsewhere on the page. */
  prefill(type, note) {
    const sel = this.fields.appointment_type;
    if (type && AppointmentRules.types.includes(type)) {
      sel.value = type;
      this.showError('appointment_type', '');
    }
    if (note) {
      const msg = this.fields.message;
      const line = `Enquiry about: ${note}`;
      if (!msg.value.trim() || /^Enquiry about: /.test(msg.value.trim())) msg.value = line;
      this.#updateCounter();
    }
    if (!this.success.hidden) this.reset();
  }

  /* ---- internals ---- */
  async #submit(e) {
    e.preventDefault();
    if (this.busy) return;
    this.status.textContent = '';

    const firstInvalid = this.validateAll();
    if (firstInvalid) {
      Object.keys(this.fields).forEach((n) => this.touched.add(n));
      firstInvalid.focus();
      return;
    }

    this.setLoading(true);
    const result = await this.service.save(this.collect());
    this.setLoading(false);

    if (result.ok) {
      this.showSuccess(result.data.appointment_id || '—');
      return;
    }

    const errors = result.errors || {};
    let first = null;
    Object.entries(errors).forEach(([name, msg]) => {
      if (this.fields[name]) {
        this.showError(name, msg);
        this.touched.add(name);
        if (!first) first = this.fields[name];
      }
    });
    this.status.textContent = result.message;
    if (first) first.focus();
  }

  #setDateBounds() {
    const d = this.fields.appointment_date;
    d.min = AppointmentRules.todayISO();
    d.max = AppointmentRules.addDaysISO(AppointmentRules.maxAdvanceDays);
  }

  #updateCounter() {
    const c = this.form.querySelector('[data-counter]');
    if (c) c.textContent = `${this.fields.message.value.length}/1000`;
  }

  #bind() {
    this.form.addEventListener('submit', (e) => this.#submit(e));

    Object.entries(this.fields).forEach(([name, el]) => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'blur';
      el.addEventListener(evt, () => {
        this.touched.add(name);
        this.showError(name, this.validateField(name));
      });
      el.addEventListener('input', () => {
        if (this.touched.has(name)) this.showError(name, this.validateField(name));
      });
    });
    this.fields.message.addEventListener('input', () => this.#updateCounter());

    this.card.querySelector('[data-form-again]').addEventListener('click', () => this.reset());

    const copyBtn = this.card.querySelector('[data-copy-ref]');
    copyBtn.addEventListener('click', async () => {
      const ref = this.success.querySelector('[data-success-ref]').textContent;
      const label = copyBtn.querySelector('span');
      try {
        await navigator.clipboard.writeText(ref);
        label.textContent = 'Copied';
      } catch (_) {
        label.textContent = 'Select & copy';
      }
      setTimeout(() => { label.textContent = 'Copy'; }, 2000);
    });
  }
}

/* ---------- Boot ---------- */
(() => {
  const formEl = document.querySelector('[data-appointment-form]');
  if (!formEl) return;

  const service = new AppointmentService({ endpoint: formEl.dataset.endpoint || 'api/appointment.php' });
  const form = new AppointmentForm(formEl, service);

  // Expose for debugging / future integrations (e.g. a status lookup widget)
  window.SMC = Object.assign(window.SMC || {}, { AppointmentService, appointmentService: service, appointmentForm: form });

  // Any element with data-book="<Appointment type>" pre-fills the form and scrolls to it
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-book]');
    if (!trigger) return;
    e.preventDefault();
    form.prefill(trigger.dataset.book, trigger.dataset.bookNote);
    const section = document.getElementById('appointment');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => form.fields.full_name.focus({ preventScroll: true }), reduce ? 0 : 700);
  });
})();
