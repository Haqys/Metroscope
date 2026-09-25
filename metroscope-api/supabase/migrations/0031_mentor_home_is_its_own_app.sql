-- ═══════════════════════════════════════════════════════════════════════════
--  MENTOR lands on a page the Mentor app actually has.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `roles.home` is the landing path each surface reads back through
-- `/v1/auth/me` (`roleDetails[].home`), and the login route composes it with
-- the origin of whichever app serves that role. MENTOR's was `/home`.
--
-- `/home` exists in the INTERNAL app. It does not exist in the Mentor app,
-- whose routes are `/me`, `/students`, `/progress`, `/assessments`,
-- `/materials`, `/competitions`, and whose own root page has said so since it
-- was built: "The mentor app has one home: /me."
--
-- So every mentor signing in was sent to http://mentor.../home, a 404 behind a
-- perfectly valid session. It is the same defect the portal had, a role routed
-- to a path that belongs to a different deployment, and it stayed invisible for
-- the same reason: the seed row looked plausible next to the four internal
-- roles, which really do live on `/home`.
--
-- `role_pages` gains `/me` too, because `CreateRole`/`UpdateRole` refuse a home
-- that is not among the role's pages ("a role whose landing page it cannot open
-- drops the holder on a 403 the moment they sign in"). Editing the Mentor role
-- through /settings/roles would otherwise fail validation on a row it did not
-- change. No policy reads `app.has_page('/me')`, so this grants nothing new.

INSERT INTO role_pages (role_id, href)
SELECT r.id, '/me' FROM roles r WHERE r.code = 'MENTOR'
ON CONFLICT DO NOTHING;

UPDATE roles SET home = '/me' WHERE code = 'MENTOR' AND home = '/home';
