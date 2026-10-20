# Taskflow pipeline workflow component

This is a standalone React/TypeScript component intended for a Next.js app.
It is separate from the repository's existing Express and vanilla-JavaScript
dashboard; it does not change or replace that application.

Install the component's runtime dependencies in a Next.js project:

```sh
npm install motion lucide-react clsx tailwind-merge
```

Next.js already provides React. For a standalone TypeScript type-check in this
folder, install the local development dependencies and run `npm run typecheck`.

Import `PipelineWorkflow` from `react-ui/PipelineWorkflow` and provide an
`onDeploy` callback. `initialStages` and `initialLogs` can be used to supply
pipeline state from the host app. If using Tailwind CSS 3, include
`./react-ui/**/*.{js,ts,jsx,tsx}` in the Tailwind `content` paths.
