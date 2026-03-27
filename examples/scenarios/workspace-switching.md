# Workspace Switching Demo

Demonstrates switching between multiple workspace contexts and verifying state isolation.

## Config
target: local
capture: har, video
viewport: 1280x720

## Steps

1. Go to the login page
2. Enter the target email and submit
3. Get the OTP (auto-fetch or prompt, depending on target)
4. Enter the OTP and verify
5. Click "Create Workspace" on the dashboard
6. Enter "Workspace Alpha" as the workspace name
7. Skip the member invite step
8. Continue to review and create the workspace
9. [save: workspace_a_id from url]
10. Navigate to the Board page
11. Add a task "Alpha Task" to the To Do column
12. [pause: 2s]
13. Go back to the Dashboard via breadcrumb
14. Create another workspace named "Workspace Beta"
15. Add a task "Beta Task" to the To Do column
16. Navigate to Settings, then back to Dashboard
17. Open the first workspace (workspace_a_id)
18. Verify "Alpha Task" is visible on the Board
19. [pause: 3s]
20. Navigate to Settings
21. [pause: 3s]
