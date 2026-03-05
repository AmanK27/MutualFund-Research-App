# GitHub Actions Runner Feature

Implement a feature allowing the user to trigger their repository's GitHub Actions workflows (e.g., the AMFI Data Sync pipeline) directly from the client-side Mutual Fund Research App.

## Proposed Changes

### [js]
#### [NEW] [github.js](file:///Users/Haither/Desktop/MutualFund%20Research%20App/js/github.js)
- Implement `triggerWorkflow(repoOwner, repoName, workflowId, token)`.
- Use `fetch` with the `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` endpoint.
- Handle API authentication securely via headers (`Authorization: Bearer <TOKEN>`).

#### [MODIFY] [app.js](file:///Users/Haither/Desktop/MutualFund%20Research%20App/js/app.js) or [ui.js](file:///Users/Haither/Desktop/MutualFund%20Research%20App/js/ui.js)
- Bind a new UI element to the `triggerWorkflow` function.
- Manage localStorage for the GitHub Personal Access Token (PAT) so the user does not need to enter it every time.

### [html]
#### [MODIFY] [index.html](file:///Users/Haither/Desktop/MutualFund%20Research%20App/index.html)
- Add a dedicated button (e.g., "⚡ Run Sync Workflow" inside the sidebar or header).
- Create a configuration modal to securely prompt the user for their GitHub PAT if it is not found in `localStorage`.

## Verification Plan
1. Ensure the UI gracefully prompts for a PAT on the first click.
2. Verify the HTTP POST request is formatted correctly according to GitHub REST API documentation.
3. Observe the GitHub Actions tab on the `AmanK27/MutualFund-Research-App` repository to confirm the workflow is successfully enqueued and executes.
