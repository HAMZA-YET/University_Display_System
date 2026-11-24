# Visual assets

The header, footer and browser icon use the university logo downloaded from the URL provided by the project leader:

- Source: https://kduniv.ac.kr/attach/IMAGE/TopDesignMgr/LogoImgUpload/2026/10/IfXF9mmGDznGYvG2.GIF
- Local asset: frontend/public/assets/kdu-official-logo.gif
- Original GIF retained without modification: 175 × 64 pixels, 6,665 bytes.
- SHA-256: 6dc5506c33a174f4059fbc85dc3d01676e9297f0a7a6fa9a8988352a16511993

The frontend serves this asset locally and preserves its aspect ratio. The previous portal mark and six professor avatars are original SVG illustrations for this project. The previous mark is retained as an unused legacy asset; avatars represent fictional sample profiles.

## Official KDU photography

At the project leader's request, the public [KDU Global homepage](https://kduniv.ac.kr/global/Main.do) is the visual reference for the current design. The project contains **74 original first-party images (3,748,322 bytes)** in `frontend/public/assets/kdu/originals/`, including six 1920 × 860 homepage photographs, the logo, banners, card photographs and CSS image resources. The source files are retained byte-for-byte. The website serves its photographs locally and does not depend on the university server at runtime.

`docs/kdu-media-manifest.json` records the exact source URL, local path, size, dimensions and SHA-256 for every download. Its scope covers media referenced by the public homepage, its same-origin stylesheets and its public gallery references; it is not an archive of every page on the university domain. Five image references in the source CSS returned 404 and are documented as unavailable. They are not used by this application.

The homepage embeds the official YouTube video [KDU Global 2027: We lead the world with new traditions!](https://www.youtube.com/watch?v=HL4dlG7BPeM). Its public H.264/AAC streams are downloaded and remuxed locally as `frontend/public/assets/kdu/originals/official-kdu-video.mp4`: 27,813,902 bytes, 640 × 360 pixels, 25 fps and 365.389 seconds. Neither stream was re-encoded; encoded packet hashes match the downloaded source tracks. The uploader's original camera/master file is not exposed, so this is a local playable copy of the public upload, not a claim to that master. The manifest records file and track hashes, codecs and provenance.

The film loads only when a visitor presses Play, in the existing accessible modal with native video controls. Closing the dialog stops playback and returns focus to its trigger. The homepage does not autoplay a video or load a third-party player. A KDU photograph is used decoratively on the launch card, not presented as a video still. Normal external links retain access to the official upload.

The hero and manual gallery use the official photos. Their captions describe only the pictured activity and do not assign an unverified campus or date. The footer credits KDU photography and identifies this application as a student project. Fictional sample notices and professor profiles remain explicitly labeled; university photography is not used to impersonate those sample people.

## Retained legacy artwork

The former generated campus illustration and project-native assets remain in the repository for existing references and design history. The homepage no longer displays the illustrative campus image.

Files: `frontend/public/assets/kdu-mark.svg`, `campus-detail.svg`, `campus-hero.webp` (1600px), `campus-hero-small.webp` (800px), `avatars/professor-1.svg` through `professor-6.svg`.

## Verification

Official faculty portraits and published profile details are documented separately in [kdu-faculty.md](kdu-faculty.md). They are stored under `frontend/public/assets/kdu/faculty/`; the original homepage media manifest remains unchanged.

The redesign passed frontend lint, 78 frontend tests and the production build. Disposable local integration checks passed 13 HTTP groups, 7 shared Chrome groups and 10 lost-and-found functional groups. The dedicated design verifier covers all 74 original image hashes and browser decoding, keyboard gallery controls, local film metadata/playback/range requests and dialog focus return, combined search, and layouts at 320/390/768/1280 pixels. No production records are used by these checks. See `scripts/member4/verify-kdu-design.mjs` and the run order in `docs/member4/README.md`.

