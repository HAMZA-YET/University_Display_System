# Member 3 (Lost and Found) v2: how to add this to the team repository

This package contains ONLY the lost-and-found files. Copy the `server`,
`client` and `docs` folders into the root of the team repository (they merge
into the existing folders; no existing team file is replaced).

New files (all Member 3):

- `server/src/modules/lostFound/` (whole folder)
- `server/scripts/lostFoundCleanup.js`
- `server/tests/lostFound.test.js`
- `client/src/api/lostFound.js`
- `client/src/lib/lostFoundLabels.js`
- `client/src/styles/lostFound.css`, `client/src/styles/footer.css`
- `client/src/assets/kdu-logo.png`
- `client/src/components/lostFound/` (whole folder)
- `client/src/pages/lostFound/` (whole folder)
- `client/src/pages/adminLostFound/` (whole folder)
- `client/src/test/LostFound.test.jsx`
- `docs/LOST_FOUND.md`

Then make these small edits to shared files by hand (teammates may have changed
them, so do not replace them). The exact lines are also in `shared.diff`.

> v2 no longer adds an OFFICER role, so `user.model.js` and `labels.js` are NOT changed.

## 1. server/src/app.js

With the other requires:

```js
const lostFound = require('./modules/lostFound/lostFound.routes');
```

After `app.use('/api/admin', adminRoutes);`:

```js
app.use('/api/public/lost-found', lostFound.publicRouter);
app.use('/api/lost-found', lostFound.router);
```

## 2. server/src/seed/fixtures/accounts.js

Add two sample students:

```js
// Lost and found (Member 3): sample students
{ key: 'student1', name: 'Sora Student', email: 'student1@kdu-uids.test', password: 'Student@12345', role: 'READER' },
{ key: 'student2', name: 'Jun Student', email: 'student2@kdu-uids.test', password: 'Student@12345', role: 'READER' },
```

## 3. server/src/seed/seed.js

With the other requires:

```js
const { seedLostFound } = require('../modules/lostFound/lostFound.seed');
```

Before `const counts = {`:

```js
// Lost and found (Member 3)
const lostFoundCounts = await seedLostFound(users);
```

First line inside `counts`:

```js
...lostFoundCounts,
```

## 4. server/tests/helpers/testDb.js

After the other model requires:

```js
require('../../src/modules/lostFound/item.model');
require('../../src/modules/lostFound/claim.model');
require('../../src/modules/lostFound/caseEvent.model');
require('../../src/modules/lostFound/counter.model');
require('../../src/modules/lostFound/notice.model');
```

## 5. server/package.json

In `"scripts"`:

```json
"lf:cleanup": "node scripts/lostFoundCleanup.js"
```

## 6. client/src/main.jsx

After `import './styles/global.css';`:

```js
import './styles/lostFound.css';
```

## 7. client/src/App.jsx

Imports:

```js
import LostFoundBrowse from './pages/lostFound/LostFoundBrowse';
import LostFoundItem from './pages/lostFound/LostFoundItem';
import ReportItem from './pages/lostFound/ReportItem';
import MyCases from './pages/lostFound/MyCases';
import MyReport from './pages/lostFound/MyReport';
import MyClaim from './pages/lostFound/MyClaim';
import LfLayout from './components/lostFound/LfLayout';
import NoticeToaster from './components/lostFound/NoticeToaster';
import AdminLfDashboard from './pages/adminLostFound/AdminLfDashboard';
import AdminLfItems from './pages/adminLostFound/AdminLfItems';
import AdminLfItem from './pages/adminLostFound/AdminLfItem';
import AdminLfClaims from './pages/adminLostFound/AdminLfClaims';
```

Right after `<NavBar />`:

```jsx
<NoticeToaster />
```

Routes (inside `<Routes>`, before the `*` NotFound route):

```jsx
<Route element={<LfLayout />}>
  <Route path="/lost-found" element={<LostFoundBrowse />} />
  <Route path="/lost-found/items/:id" element={<LostFoundItem />} />

  <Route element={<ProtectedRoute />}>
    <Route path="/lost-found/report" element={<ReportItem />} />
    <Route path="/lost-found/my-cases" element={<MyCases />} />
    <Route path="/lost-found/my-reports/:id" element={<MyReport />} />
    <Route path="/lost-found/my-reports/:id/edit" element={<ReportItem />} />
    <Route path="/lost-found/my-claims/:id" element={<MyClaim />} />
  </Route>

  <Route element={<ProtectedRoute roles={['ADMIN']} />}>
    <Route path="/admin/lost-found" element={<AdminLfDashboard />} />
    <Route path="/admin/lost-found/items" element={<AdminLfItems />} />
    <Route path="/admin/lost-found/items/:id" element={<AdminLfItem />} />
    <Route path="/admin/lost-found/claims" element={<AdminLfClaims />} />
  </Route>
</Route>
```

## 8. client/src/components/layout/NavBar.jsx

After the Professors link:

```jsx
<NavLink to="/lost-found">Lost &amp; Found</NavLink>
```

## 9. client/src/components/layout/Footer.jsx (needs team agreement)

The footer is shared by every page. v2 replaces its content with the blue KDU
footer (campus addresses + logo on a white badge). Ask the leader first; if
agreed, replace the file with the version in this package's full project, or
copy it from `shared.diff`. It uses `client/src/styles/footer.css` and
`client/src/assets/kdu-logo.png` (both included here).

## Check

```
npm install
npm run lint
npm test
npm run seed
npm run dev
```
