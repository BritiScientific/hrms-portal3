-- Initial schema for a new, empty HRMS PostgreSQL database.
-- Run with: psql -h localhost -U hrms_user -d hrms_portal -f backend/database/schema.sql

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_primary_color TEXT NOT NULL DEFAULT '#356ee9',
  ADD COLUMN IF NOT EXISTS brand_sidebar_color TEXT NOT NULL DEFAULT '#21ad72',
  ADD COLUMN IF NOT EXISTS brand_background_color TEXT NOT NULL DEFAULT '#f4f7fc',
  ADD COLUMN IF NOT EXISTS brand_font TEXT NOT NULL DEFAULT 'DM Sans',
  ADD COLUMN IF NOT EXISTS brand_logo_data TEXT,
  ADD COLUMN IF NOT EXISTS brand_show_logo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'HR',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  profile_picture TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;

CREATE TABLE IF NOT EXISTS password_reset_otps (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_admin_invitations (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS organization_admin_invitations_pending_idx
  ON organization_admin_invitations (organization_id, LOWER(email), expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  duration_months INTEGER NOT NULL CHECK (duration_months > 0),
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  max_employees INTEGER CHECK (max_employees IS NULL OR max_employees >= 0),
  max_users INTEGER CHECK (max_users IS NULL OR max_users >= 0),
  max_candidates INTEGER CHECK (max_candidates IS NULL OR max_candidates >= 0),
  max_departments INTEGER CHECK (max_departments IS NULL OR max_departments >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  price_at_purchase NUMERIC(12, 2) NOT NULL CHECK (price_at_purchase >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_one_active_idx
  ON organization_subscriptions (organization_id) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS organization_subscriptions_dates_idx
  ON organization_subscriptions (organization_id, start_date, end_date);

-- Preserve current access for organizations already in the system. New organizations
-- need an explicit plan assignment before they can add staff or candidates.
INSERT INTO subscription_plans (
  name, duration_months, price, currency, is_active, is_system
)
VALUES ('Legacy unlimited access', 12, 0, 'INR', TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO organization_subscriptions (
  organization_id, plan_id, start_date, end_date, status,
  price_at_purchase, currency
)
SELECT o.id, p.id, CURRENT_DATE, NULL, 'ACTIVE', 0, 'INR'
FROM organizations o
CROSS JOIN subscription_plans p
WHERE p.name = 'Legacy unlimited access'
  AND NOT EXISTS (
    SELECT 1 FROM organization_subscriptions s
    WHERE s.organization_id = o.id AND s.status = 'ACTIVE'
  );

CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  manager_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, name),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS designations (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, title)
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  official_email TEXT,
  phone TEXT,
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  designation_id BIGINT REFERENCES designations(id) ON DELETE SET NULL,
  joining_date DATE,
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE',
  biometric_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, employee_code),
  UNIQUE (organization_id, biometric_user_id)
);

CREATE TABLE IF NOT EXISTS attendance_raw_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_user_id TEXT NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type TEXT NOT NULL DEFAULT 'UNKNOWN',
  verification_type TEXT,
  source_hash TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id, source_hash)
);

CREATE TABLE IF NOT EXISTS attendance_daily (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PRESENT',
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS manpower_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  requested_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  designation TEXT NOT NULL,
  number_of_positions INTEGER NOT NULL DEFAULT 1 CHECK (number_of_positions > 0),
  experience_required TEXT,
  skills_required TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_openings (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  job_title TEXT NOT NULL,
  job_code TEXT,
  job_description TEXT,
  required_skills TEXT,
  location TEXT,
  number_of_positions INTEGER NOT NULL DEFAULT 1 CHECK (number_of_positions > 0),
  status TEXT NOT NULL DEFAULT 'OPEN',
  posted_date DATE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_opening_id BIGINT REFERENCES job_openings(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  experience_years NUMERIC(5, 2) NOT NULL DEFAULT 0,
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'APPLIED',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Role-specific account links and employee leave workflow.
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id BIGINT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_department_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_department_id_fk
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique_idx
  ON users (employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note TEXT,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE')),
  completed_at TIMESTAMPTZ,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_items (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'RETIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, asset_tag)
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES asset_items(id) ON DELETE RESTRICT,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMPTZ,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_assignments_active_asset_idx
  ON asset_assignments (asset_id) WHERE returned_at IS NULL;

CREATE TABLE IF NOT EXISTS exit_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  last_working_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note TEXT,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  gross_pay NUMERIC(12, 2) NOT NULL CHECK (gross_pay >= 0),
  deductions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net_pay NUMERIC(12, 2) NOT NULL CHECK (net_pay >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PAID')),
  paid_at TIMESTAMPTZ,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, period_start)
);

CREATE TABLE IF NOT EXISTS interviews (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_opening_id BIGINT REFERENCES job_openings(id) ON DELETE SET NULL,
  interviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  interview_type TEXT NOT NULL DEFAULT 'VIDEO',
  location_or_link TEXT,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS employees_organization_idx ON employees (organization_id);
CREATE INDEX IF NOT EXISTS attendance_daily_org_date_idx ON attendance_daily (organization_id, attendance_date);
CREATE INDEX IF NOT EXISTS candidates_organization_idx ON candidates (organization_id);
CREATE INDEX IF NOT EXISTS leave_requests_org_status_idx ON leave_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS onboarding_tasks_employee_idx ON onboarding_tasks (organization_id, employee_id);
CREATE INDEX IF NOT EXISTS asset_items_org_status_idx ON asset_items (organization_id, status);
CREATE INDEX IF NOT EXISTS payroll_records_employee_period_idx ON payroll_records (employee_id, period_start DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
