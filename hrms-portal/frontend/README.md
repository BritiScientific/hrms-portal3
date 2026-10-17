# HRMS Portal frontend

This is the React frontend for Whatsoft HRMS Portal. For database setup,
backend configuration, first Super Admin setup, and the complete deployment
sequence, see the [main project README](../README.md).

## Local development

From the repository root, start the frontend and backend together:

```powershell
npm.cmd run dev
```

The frontend uses `/api/v1` by default, and its development-server proxy
connects to the backend started by the same command. Configure the database and
backend environment in `backend/.env` first.

## Production build

Set `VITE_API_BASE_URL` in the frontend build environment to the API base URL,
including `/api/v1`, for example:

```text
https://api.example.com/api/v1
```

Build the static frontend files with:

```powershell
npm.cmd run build
```

Deploy the generated `dist` directory to a static host. For Netlify, use
`frontend` as the base directory, `npm run build` as the build command, and
`dist` as the publish directory. The `public/_redirects` file makes Netlify
serve `index.html` for application routes, including `/accept-invite`, so
invitation links open the React application. Other hosts need an equivalent
SPA fallback. The frontend is not a substitute for the Express API; deploy the
backend and PostgreSQL database separately.

Only public frontend configuration belongs in `VITE_*` variables. Never put
database credentials, JWT secrets, or the Super Admin bootstrap key in the
frontend build environment.
