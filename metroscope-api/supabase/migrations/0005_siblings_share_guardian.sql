-- Siblings. One guardian account, several children.
--
-- students.user_id holds the PARENT's user (doc 09: "ortu login & bayar"), and
-- it was UNIQUE, which made a family's second child fail conversion on a
-- constraint violation. The assumption "one student, one account" is not how
-- this business works, and the alternative (a second login per child) splits a
-- family's invoices across accounts where neither shows the whole picture.
--
-- app.owns_student() already scopes by membership rather than by uniqueness, so
-- RLS is unaffected: the constraint was the only thing preventing this.
ALTER TABLE "students" DROP CONSTRAINT "students_user_id_unique";--> statement-breakpoint
-- Lookups by guardian are now one-to-many and happen on every portal page load.
CREATE INDEX IF NOT EXISTS "students_user_idx" ON "students" USING btree ("user_id");
