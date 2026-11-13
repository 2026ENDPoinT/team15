export const migration1 = `
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    department TEXT NOT NULL,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 5),
    enrollment TEXT NOT NULL CHECK (enrollment IN ('enrolled', 'leave', 'other')),
    keywords_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE notices (
    id TEXT PRIMARY KEY NOT NULL,
    source_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    published_date TEXT,
    analysis_json TEXT,
    analyzed_content_hash TEXT,
    schema_version TEXT,
    extractor_version TEXT,
    analyzed_at TEXT,
    analysis_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (analysis_status IN ('pending', 'running', 'ready', 'failed', 'unsupported')),
    last_error TEXT,
    UNIQUE (source_id, board_id, post_id)
  );

  CREATE TABLE user_notices (
    notice_id TEXT PRIMARY KEY NOT NULL REFERENCES notices(id),
    disposition TEXT NOT NULL DEFAULT 'unseen'
      CHECK (disposition IN ('unseen', 'saved', 'dismissed')),
    progress TEXT CHECK (progress IN ('saved', 'preparing', 'applied')),
    saved_at TEXT,
    updated_at TEXT NOT NULL,
    checklist_initialized INTEGER NOT NULL DEFAULT 0
      CHECK (checklist_initialized IN (0, 1)),
    checklist_snapshot_hash TEXT,
    deadline_baseline_hash TEXT,
    CHECK (disposition <> 'saved' OR (progress IS NOT NULL AND saved_at IS NOT NULL))
  );
  CREATE INDEX idx_user_notices_disposition ON user_notices(disposition);

  CREATE TABLE checklist_items (
    id TEXT PRIMARY KEY NOT NULL,
    notice_id TEXT NOT NULL REFERENCES user_notices(notice_id),
    text TEXT NOT NULL,
    evidence TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_checklist_items_notice_id ON checklist_items(notice_id);

  CREATE TABLE reminders (
    reminder_key TEXT PRIMARY KEY NOT NULL,
    notice_id TEXT NOT NULL REFERENCES user_notices(notice_id),
    desired_fire_at TEXT,
    applied_fire_at TEXT,
    os_identifier TEXT,
    state TEXT NOT NULL,
    last_error TEXT
  );

  CREATE TABLE sync_state (
    source_id TEXT PRIMARY KEY NOT NULL,
    last_attempt_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    detail_failures INTEGER NOT NULL DEFAULT 0
  );
`;

export const migration2 = `
  ALTER TABLE notices ADD COLUMN analysis_request_id TEXT;
  CREATE TABLE sync_control (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    analysis_retry_at TEXT
  );
  INSERT INTO sync_control (id) VALUES (1);
`;

export const migration3 = `
  ALTER TABLE profile ADD COLUMN college TEXT;
  ALTER TABLE profile ADD COLUMN custom_keywords_json TEXT NOT NULL DEFAULT '[]';
`;

export const migration4 = `
  ALTER TABLE user_notices ADD COLUMN permanently_deleted INTEGER NOT NULL DEFAULT 0
    CHECK (permanently_deleted IN (0, 1));
`;

export const migration5 = `
  CREATE TABLE discovered_keywords (
    keyword TEXT PRIMARY KEY NOT NULL
  );
`;

export const migration6 = `
  ALTER TABLE user_notices ADD COLUMN memo TEXT NOT NULL DEFAULT '';
`;
