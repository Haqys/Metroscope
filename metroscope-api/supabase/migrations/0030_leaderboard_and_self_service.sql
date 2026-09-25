-- ═══════════════════════════════════════════════════════════════════════════
--  The leaderboard a family may actually read, and the settings they may
--  actually change (doc 03 FR-GAM-1/2, FR-SET-1..3, doc 10 §1 open item 4).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `50_students.sql` left a note where this belongs:
--
--   "⚠️ NOT IMPLEMENTED HERE. students.show_on_leaderboard defaults to false
--    and the leaderboard is Phase 3. When it lands it must NOT relax
--    students_select: a leaderboard needs display name and points for opted-in
--    students, not the row, which carries dob, school and the parent's phone
--    number. Give it a view with exactly those columns and its own policy."
--
-- That warning was load-bearing. `students_select` is
-- `user_id = app.current_user_id() OR app.has_page('/students')`, so a
-- guardian's own SELECT over `students` returns exactly one row: their child.
-- Any leaderboard built from it therefore reports rank 1 of 1 for every
-- family in the school, silently and always. Nothing errors. The number is
-- simply a lie, which is the failure mode the portal fixtures already had.
--
-- Functions rather than a view, for two reasons. A view still needs its own
-- grant and would carry the raw name into a relation anybody may query; and
-- the masking (`show_on_leaderboard`) has to happen BEFORE the row leaves the
-- owner's rights, not in TypeScript afterwards, or the opt-out is decoration.

-- ── the board ──────────────────────────────────────────────────────────
/**
 * The top of one level's board, names masked by the family's own choice.
 *
 * SECURITY DEFINER so it can count students the caller may not read, and
 * deliberately narrow in what it hands back: an id, a nullable display name,
 * points, and a rank. No dob, no school, no parent phone. A caller who is not
 * on the board learns the same thing a caller who is learns, which is the
 * point of a leaderboard.
 *
 * `rank()` and not `row_number()`: equal points must share a place, and it is
 * the same arithmetic as `app.leaderboard_standing()` below (count of
 * strictly-greater, plus one), so a student's own rank and their row on the
 * board can never disagree.
 */
CREATE OR REPLACE FUNCTION app.leaderboard(p_level school_level, p_limit integer DEFAULT 10)
RETURNS TABLE (student_id uuid, display_name text, points integer, rank integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id,
    -- A family that opted out keeps its place and loses its name.
    CASE WHEN s.show_on_leaderboard THEN s.name END,
    s.points,
    (rank() OVER (ORDER BY s.points DESC))::integer
  FROM students s
  WHERE s.level IS NOT DISTINCT FROM p_level
    AND s.student_status = 'ACTIVE'
  ORDER BY s.points DESC, s.name
  LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
$$;

COMMENT ON FUNCTION app.leaderboard(school_level, integer) IS
  'One level''s leaderboard: id, points, rank, and a name only for students '
  'whose family opted in. Never widen this to return the students row.';

-- ── one student's standing ─────────────────────────────────────────────
/**
 * Where this student sits, and how many they are being compared with.
 *
 * Ownership-gated, unlike the board above. The board is anonymous by
 * construction; this one takes a student id, so answering it for an arbitrary
 * uuid would turn the function into an oracle ("is this id a real student, and
 * how good are they"). A caller gets their own children, and staff who hold
 * the students page get anyone, which is the same rule `students_select` uses.
 */
CREATE OR REPLACE FUNCTION app.leaderboard_standing(p_student_id uuid)
RETURNS TABLE (rank integer, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*)::integer + 1 FROM students p
      WHERE p.points > me.points
        AND p.level IS NOT DISTINCT FROM me.level
        AND p.student_status = 'ACTIVE'),
    (SELECT count(*)::integer FROM students p
      WHERE p.level IS NOT DISTINCT FROM me.level
        AND p.student_status = 'ACTIVE')
  FROM students me
  WHERE me.id = p_student_id
    AND (app.owns_student(me.id) OR app.has_page('/students'))
$$;

COMMENT ON FUNCTION app.leaderboard_standing(uuid) IS
  'Rank and cohort size for one student. Ownership-gated so it cannot be used '
  'to probe arbitrary student ids.';

-- ── the three fields a family owns on their own child ──────────────────
/**
 * FR-SET-1..3 give a guardian three things to change: the contact name, the
 * contact phone, and whether their child is named on the leaderboard.
 *
 * They could not change any of them. `students_update` is
 * `app.has_action('student.edit')`, a STAFF verb, so the settings page had a
 * privacy toggle that no request could ever persist. And relaxing that policy
 * is the wrong repair: RLS is row-level, so "the owner may update their own
 * row" would also hand the owner `points`, `level`, `account_status` and
 * `student_status`. A family could promote its own child to ACTIVE without
 * paying, or award itself the leaderboard.
 *
 * So: a function whose signature IS the allowlist. Three parameters, three
 * columns, ownership checked in the database rather than in the caller, and no
 * way to reach a fourth column through it however the API is called.
 *
 * The API sends all three values every time (it merges against the row it just
 * read), so there is no COALESCE here, a NULL means "clear it", which is what
 * emptying a phone field should do.
 */
CREATE OR REPLACE FUNCTION app.update_student_self(
  p_student_id          uuid,
  p_parent_name         text,
  p_parent_phone        text,
  p_show_on_leaderboard boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  -- Not an error worth a stack trace: the API turns false into 403.
  IF NOT app.owns_student(p_student_id) THEN
    RETURN false;
  END IF;

  UPDATE students SET
    parent_name         = nullif(btrim(coalesce(p_parent_name, '')), ''),
    parent_phone        = nullif(btrim(coalesce(p_parent_phone, '')), ''),
    show_on_leaderboard = coalesce(p_show_on_leaderboard, false)
  WHERE id = p_student_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION app.update_student_self(uuid, text, text, boolean) IS
  'The only path by which a guardian writes to students. Three columns by '
  'signature; ownership by app.owns_student(). Never add a parameter here '
  'without asking whether a family may set that column about themselves.';

GRANT EXECUTE ON FUNCTION
  app.leaderboard(school_level, integer),
  app.leaderboard_standing(uuid),
  app.update_student_self(uuid, text, text, boolean)
TO authenticated;
