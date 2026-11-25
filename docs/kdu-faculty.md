# Official KDU faculty directory

The directory uses the [published KDU Global faculty listing](https://www.kduniv.ac.kr/global/CMS/Contents/Contents.do?mCode=MN090). `backend/src/data/kdu-faculty.json` records all 58 source identities, exact roles/designations and qualifications, source URL/retrieval time and original portrait provenance. The listing contains 42 professors, 7 instructors and 9 visiting faculty. It publishes 43 work emails; 15 are absent and remain null.

All 58 portrait originals are stored in `frontend/public/assets/kdu/faculty/` (1,430,004 bytes). Each photo was matched using its enclosing source card, heading and image alt text. Source hashes and dimensions are retained in the catalog; images are served locally without enlarging the small original portraits. The source's spelling and PhD Candidate wording are retained.

The [Goseong campus contact directory](https://www.kduniv.ac.kr/kor/CMS/HaksaContactMgr/list3.do?mCode=MN239) supplements the faculty listing. `backend/src/data/kdu-faculty-contacts.json` records matched department assignments and office room numbers. Language program assignments come from the published instructor titles. Unverified locations, building names, and other unpublished details remain empty. Qualifications are searchable and are labelled separately from teaching subjects.

## Integration and updates

Official records live in the existing `Professor` collection, so Home, directory, dedicated professor search and combined search use the same data. Immutable `sourceKey` values and deterministic identifiers make the manual import repeatable. Importing again only inserts missing records and preserves administrator edits, hidden status and versions. Source roles/qualifications/designations are read-only metadata; contact/office/teaching fields can be maintained through the existing admin form when verified.

The directory waits for a department or keyword before showing profiles. Directory and campus search match names, published roles and qualifications, subjects, and office room numbers. Public reads use the matched contacts as defaults for missing department and room fields. Saved administrator values take precedence. The supplemental contact catalog takes effect on deployment without a database migration.

The operator command is `node backend/src/cli/import-kdu-faculty.js`. Supply the existing database configuration through the environment (for local development, Node's `--env-file=backend/.env` can load it). No flags performs a read-only dry run. `--archive-samples` adds the proposed sample archive counts; `--apply --archive-samples` explicitly applies the plan. This command is not part of application startup, normal builds, seeding or an HTTP endpoint.

The import preflights both email and identifier collisions, builds partial unique indexes for published email/source keys, and replaces the legacy email index before inserting multiple unpublished emails. Faculty inserts, optional sample archiving and operator audit entries run in one transaction. On a collision or audit failure no profile/archive writes commit. Archiving targets only pristine version-1 records with the exact installed sample IDs and ownership keys. Edited samples and unrelated records are preserved; nothing is deleted. Future source refreshes/removals need deliberate review instead of overwriting current data automatically.

## Validation

Twelve backend faculty regressions cover source fidelity, missing values, unique emails, index migration, read-only dry runs, collisions, idempotence, admin edits, sample preservation and transaction rollback. Existing professor, member-tools and sample-content suites remain compatible. Frontend tests cover honest missing details, image fallback and saving an official profile without inventing required fields.

Use `scripts/member4/start-isolated-preview.cjs --with-official-faculty` for a disposable local database containing the catalog; the normal fixture mode is unchanged. After building/starting the isolated frontend, `scripts/member4/verify-faculty-directory.mjs` checks all 58 source records, original portrait hashes/decoding, role/qualification search, navigation and four responsive widths. Set `UIDS_PLAYWRIGHT_MODULE` for an external Playwright installation. Its default target is the isolated preview; the explicit `UIDS_FACULTY_BASE=https://university-display-system.vercel.app` mode performs only public GET/HEAD production checks after import.

Spacing changes are scoped in `frontend/src/styles/spacing.css` and `faculty.css`. Public, member and admin layouts were reviewed at 320/390/768/1280 pixels, including populated cards, account panels, official-profile edit modals, tables, file controls and the Home shortcuts. Browser evidence is stored in ignored `node_modules/.cache/faculty-*` directories.
