# Privacy policy page

## Purpose

A public, static privacy policy page for the InnoPeak web app. It is informational only: no admin
editing, versioning, or user acceptance tracking is included in this phase.

## Route

- Path: `/privacy`
- Added to `ROUTES.PRIVACY`
- Rendered in the `(public)` route group, so it uses the public layout and stays reachable without
  authentication.
- Included in `sitemap.ts`.

## Content

The page is a server component using `getTranslations("privacy")`. All copy lives in
`messages/en.json` and `messages/de.json`; no user-facing strings are hard-coded in the component.

Sections:

1. Introduction and effective date
2. Data we collect (account/business details, Google Business Profile data, reviews, generated
   replies, usage and audit logs)
3. How we use the data
4. Google OAuth scopes and what is read vs. written
5. AI processing and third-party providers
6. Cookies and session handling
7. Data retention and deletion
8. User rights and contact

## Acceptance criteria

- `/privacy` renders in both supported locales.
- The page is linked from the public site footer.
- Heading hierarchy is semantic (`h1` then `h2`).
- The route is public and is not blocked by auth middleware.
- en/de message keys stay in parity (covered by the existing messages test).
- Mobile layout does not overflow and long German words wrap or truncate deliberately.

## Out of scope

- Admin editing or publishing of policy text
- Policy versioning
- User acceptance tracking or re-acceptance prompts
- Terms of service page