CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL DEFAULT 'none',
  plan_status TEXT NOT NULL DEFAULT 'inactive',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
