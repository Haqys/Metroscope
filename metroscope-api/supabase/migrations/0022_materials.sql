-- ═══════════════════════════════════════════════════════════════════════════
--  Learning materials (doc 06 §2.3, doc 13 §12.7, doc 14 §3.3).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §12.7 states the defect and its cost: "internal /materials writes
-- nowhere; portal reads materials-data.ts", risk, "the entire
-- learning-delivery promise is a mock". Two screens, two fixtures, no table.
--
-- The design turns on ONE distinction, which doc 06 makes and the fixtures
-- could not: **entitlement is not consumption**. `material_assignments` decides
-- who may SEE a module; `material_progress` records what a student DID with it.
-- Collapsing them, the obvious shortcut, one row per student per material, 
-- makes "assign this to the whole SMP level" impossible to express without
-- fanning out a row per child and re-fanning every time somebody enrols.

/**
 * A resource is only ever one of three things (doc 06 §2.3): a YouTube video, a
 * PDF, or a Google Drive link. Explicitly NOT self-hosted video, doc 08's cost
 * model has no line for egress, and a bimbel does not run a CDN.
 */
DO $$ BEGIN
  CREATE TYPE material_kind AS ENUM ('YOUTUBE', 'PDF', 'GDRIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/** doc 06: NOT_STARTED "Belum Dibuka" / IN_PROGRESS "Sedang Dipelajari" / DONE "Selesai". */
DO $$ BEGIN
  CREATE TYPE material_progress_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * A study module.
 *
 * `status` reuses `content_status`, the enum the CMS pipeline already uses, but
 * NOT the pipeline itself. doc 13 §12.7 asks for "a publish state so
 * half-finished modules are not visible", a two-state fact, while the
 * pipeline is built around public URLs, 301s on rename, ISR cache tags and an
 * editorial review by roles that hold `content.review`. A material has no
 * public URL, is read by entitlement, and is authored by MENTOR, who holds no
 * content verb at all. Registering it would mean `publicPath: null`,
 * `revalidateTags: []` and a review step nobody performs.
 *
 * Sharing the VOCABULARY costs nothing and keeps one meaning of DRAFT in the
 * database. Only DRAFT, PUBLISHED and ARCHIVED are reachable through the API.
 */
CREATE TABLE IF NOT EXISTS materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** doc 06: a module belongs to a Topic, and topics are the portal filter chips. */
  topic_id    uuid REFERENCES topics(id) ON DELETE SET NULL,

  title       text NOT NULL,
  /** The portal's detail route is /portal/materials/[slug]. */
  slug        text NOT NULL UNIQUE,
  description text,
  order_index integer NOT NULL DEFAULT 0,

  status       content_status NOT NULL DEFAULT 'DRAFT',
  published_at timestamptz,

  created_by_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materials_status_idx ON materials (status, order_index);
CREATE INDEX IF NOT EXISTS materials_topic_idx ON materials (topic_id, order_index);

CREATE TABLE IF NOT EXISTS material_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  kind        material_kind NOT NULL,
  title       text NOT NULL,
  /** YouTube video id · PDF url · Drive share link. Validated per kind by Zod. */
  url         text NOT NULL,
  /** YouTube only, the card prints "45 menit". */
  duration_min integer,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_resources_idx ON material_resources (material_id, order_index);

/**
 * ENTITLEMENT, doc 06 "MaterialAssignment", added 2026-07-27 by doc 11 §8.1.
 *
 * Exactly one scope: a named student, a whole programme, or a whole school
 * level. The client asked for all three ("per siswa, atau per siswa type, atau
 * keduanya"), and `num_nonnulls` is what makes "exactly one" a fact the
 * database enforces rather than a rule three call sites remember.
 *
 * A programme-scoped assignment reaches students through `enrollments`, so a
 * child who enrols next month gets the back catalogue without anybody
 * reassigning anything. That is the whole reason this is not a join table of
 * (student, material) pairs.
 */
CREATE TABLE IF NOT EXISTS material_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

  student_id  uuid REFERENCES students(id) ON DELETE CASCADE,
  program_id  uuid REFERENCES programs(id) ON DELETE CASCADE,
  level       school_level,

  assigned_by_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT material_assignments_one_scope
    CHECK (num_nonnulls(student_id, program_id, level) = 1)
);

CREATE INDEX IF NOT EXISTS material_assignments_material_idx ON material_assignments (material_id);
CREATE INDEX IF NOT EXISTS material_assignments_student_idx ON material_assignments (student_id);
CREATE INDEX IF NOT EXISTS material_assignments_program_idx ON material_assignments (program_id);
CREATE INDEX IF NOT EXISTS material_assignments_level_idx ON material_assignments (level);

/** The same assignment twice is one assignment. */
CREATE UNIQUE INDEX IF NOT EXISTS material_assignments_student_uq
  ON material_assignments (material_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS material_assignments_program_uq
  ON material_assignments (material_id, program_id) WHERE program_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS material_assignments_level_uq
  ON material_assignments (material_id, level) WHERE level IS NOT NULL;

/**
 * CONSUMPTION. One row per (student, material), written when they open it and
 * again when they finish.
 *
 * The composite primary key is the uniqueness doc 06 asks for, and it makes
 * "opened twice" unrepresentable rather than something a service deduplicates.
 */
CREATE TABLE IF NOT EXISTS material_progress (
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  material_id  uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  status       material_progress_status NOT NULL DEFAULT 'NOT_STARTED',
  opened_at    timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (student_id, material_id)
);

CREATE INDEX IF NOT EXISTS material_progress_material_idx ON material_progress (material_id, status);

/**
 * Is this student allowed to see this material?
 *
 * SECURITY DEFINER because it reads `enrollments` to resolve a programme-scoped
 * assignment, and a guardian may read their own enrolments but a MENTOR opening
 * the engagement roster may not read somebody's billing-adjacent rows. Pinned
 * search_path, per the convention in 00_helpers.sql.
 *
 * The three scopes are OR'd in one place so that every reader, the portal
 * list, the detail page, the progress write, the mentor's roster, asks the
 * same question. Four copies of this predicate is four chances to leak a module
 * to a family that was never given it.
 */
CREATE OR REPLACE FUNCTION app.student_entitled_to_material(target_student uuid, target_material uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM material_assignments a
    LEFT JOIN students s ON s.id = target_student
    WHERE a.material_id = target_material
      AND (
        a.student_id = target_student
        OR (a.level IS NOT NULL AND a.level = s.level)
        OR (a.program_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM enrollments e
              WHERE e.student_id = target_student
                AND e.program_id = a.program_id
                AND e.status = 'ACTIVE'
            ))
      )
  )
$$;

COMMENT ON FUNCTION app.student_entitled_to_material(uuid, uuid) IS
  'Entitlement across all three assignment scopes (student, programme, level). '
  'One definition, so every reader asks the same question.';

ALTER TABLE materials             ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_resources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_progress     ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON materials            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON material_resources   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON material_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON material_progress   TO authenticated;

/**
 * No grant to `anon`. A published material is not public: it is paid-for
 * teaching content, entitled per student, and the marketing site has no page
 * that would want one.
 */
