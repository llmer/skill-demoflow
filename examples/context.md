# App Context

Acme is a project management SaaS. Users create Workspaces and manage Tasks with team members. This context helps generate accurate Playwright scripts.

## Auth Flow

- Login page at `/login` has `input[type="email"]` and button "Continue with Email"
- Verify page at `/verify` has `input[inputMode="numeric"]` for 6-digit OTP and button "Verify"
- After verify, redirects to `/dashboard`

## Dashboard (`/dashboard`)

- Shows list of workspace cards as links: `a[href^="/workspaces/{id}"]`
- "Create Workspace" link: `a[href="/workspaces/new"]`
- Empty state shows welcome hero if no workspaces exist

## Workspace Creation (`/workspaces/new`)

- Multi-step wizard: name → members → settings → review
- Workspace name input: `input[placeholder="My Workspace"]`
- Member invite input: `input[placeholder="teammate@example.com"]`
- Role selection: `select` dropdown with Owner, Admin, Member options
- "Continue to Review" button scrolls to review section
- "Create Workspace" button submits and redirects to `/workspaces/{id}/overview`

## Task Board (`/workspaces/{id}/board`)

- Kanban columns: To Do, In Progress, Done
- Add task button per column: `button:has-text("Add Task")`
- Task cards are draggable: `div[data-task-id]`
- Task detail modal opens on card click

## Navigation

- Sidebar: links for Overview, Board, Members, Settings, Activity
- Sidebar selectors: `nav a:has-text("Settings")`, `nav a:has-text("Board")`, etc.
- Breadcrumb at top: `a[href="/dashboard"]` always present
- Workspace cards on dashboard: `a[href^="/workspaces/{id}"]`

## Rate Limits

- Workspace creation: 5 per hour per user
- API calls: 100 per minute
- Use unique email per test run to avoid rate limit carryover
