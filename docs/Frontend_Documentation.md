# Domain Health Checker - Frontend Architecture Documentation

The frontend is a fully responsive, modern React application built on the **Next.js 15 (App Router)** framework. It utilizes TypeScript for strict prop validation and a component-based architecture for maximum code reusability.

---

## 1. High-Level Frontend Directory Structure

The system is organized logically to separate full pages (Routes) from reusable UI blocks (Components).

* **`/app/`**: Contains the Next.js routing infrastructure.
  * **`/app/page.tsx`**: The main public landing page housing the `Hero` and solitary `DomainChecker`.
  * **`/app/dashboard/page.tsx`**: The authenticated user view.
  * **`/app/admin/page.tsx`**: The privileged view containing the overarching data tables.
  * **`/app/settings/page.tsx`**: Configuration and user profile management.
* **`/components/`**: The library of isolated React UI components (e.g., Modals, Tables, Health Dials).
* **`/contexts/`**: Contains React Context Providers (e.g., Authentication state, Theme state) that wrap the application in `layout.tsx`.
* **`/lib/hooks.ts`**: Reusable custom React hooks (e.g., `useFetch`, `useAuth`) for managing asynchronous loading states and API interactions.

---

## 2. Core UI Components Overview

### `DomainChecker.tsx` (The Brain of the UI)
This is a "Smart Component." It manages the React state (`useState`) for the search input, the loading boolean, and the final `report` object.
* **Functionality:** When a user types `example.com` and hits Enter, this component triggers the `fetch('/api/scan')`.
* **Interaction:** While awaiting the response, it toggles a loading state (which renders a spinner or `ParticleBackground`). Once `Res.json()` returns, it injects the resulting payload into the downstream "Dumb Components".

### Display Components (Dumb Components)
These components take in strict TypeScript interfaces as props and simply render UI based entirely on that data.
* **`ResultTable.tsx`**: Receives an array of `TestResult` objects. Maps over the array and outputs a structured HTML table row for each networking test (e.g. `DNS`, `A Record`). Color codes the Status column via Tailwind conditionally: `text-green-500` for Pass, `text-red-500` for Error.
* **`HealthCards.tsx`**: Reads the global `Score` calculated by the backend. Renders a radial dial or a summary block displaying an aggregate "Health Percentage (0-100%)".
* **`ProblemSummaryTable.tsx` / `ProblemsSection.tsx`**: Specifically filters the `report` object for *only* tests marked `Warning` or `Error`. Useful for the top of the page so a user doesn't have to scroll past 40 "Passed" tests to find the 1 broken SPF record.
* **`RawRecord.tsx`**: A simple `<pre>` block component that safely renders the raw JSON payload for advanced users debugging API structures.

### Layout Components
* **`Navbar.tsx`**: Fixed top navigation. Includes routing links (Home, Dashboard) and crucially mounts the `NotificationDropdown.tsx` and the User Profile / `LoginModal.tsx` trigger.
* **`Hero.tsx`**: The massive marketing banner on the root page introducing the tool to new guests.

---

## 3. Data Flow & State Management

**Authentication State**
Firebase Auth sits on top of the App `layout.tsx`.
1. `onAuthStateChanged` hook fires globally.
2. If a user logs in via `LoginModal.tsx`, the Context saves the `User` object.
3. Protected routes like `/admin/page.tsx` read this Context. If `user.role !== 'admin'`, the Next.js router executes an immediate `redirect('/')` to bounce them to safety.

**Scanning Data Flow**
```text
[ User Types: "stripe.com" ]
          │
[ DomainChecker `onChange` State Updates ]
          │
[ Click "Scan" Button ]
          │
   (Triggers `async function handleScan()`)
          ├─► `setLoading(true)`
          ├─► `setError(null)`
          ├─► `await fetch('/api/scan')`
          │           │
          ◄───────────┘ (Receives JSON)
          │
   (Response Handling)
   if Status 200:
       ├─► `setReport(json.results)`
       ├─► `setLoading(false)`
   else:
       ├─► `setError("API Failed")`
       └─► `setLoading(false)`
          │
[ React Automatically Re-Renders `ResultTable` with new `report` prop ]
```

---

## 4. Admin & Bulk Views

* **`BulkResultsTable.tsx`**: Unlike the single DomainChecker, the admin panel needs to display data for thousands of domains simultaneously. This component connects to `/api/admin/domains`.
* **Features:** 
  * Displays domains in a massive grid.
  * Implements pagination and client-side filtering (`Filter by: At Risk`).
  * Includes a specific "Force Rescan All" button which loops an asynchronous queue to re-trigger checks on every domain in the database sequentially without crashing the browser's thread pool.

---

## 5. UI/UX Polishing Details

* **Tailwind CSS (`globals.css`)**: All styling is driven by utility classes. This guarantees zero CSS conflicts between components. The project uses heavy conditional rendering, for example: `className={status === 'Pass' ? 'bg-green-100' : 'bg-red-100'}`.
* **Toast Notifications (`toast.ts`)**: Instead of blocking `alert('Error')` dialogs, the frontend uses a non-blocking toast notification system (e.g. "Domain Scanned Successfully!" sliding in from the bottom right).
* **Responsive Design:** Every table component inherently collapses into vertical stacks or utilizes `overflow-x-auto` to ensure the complex data grids remain perfectly legible on mobile Safari or Chrome devices.
