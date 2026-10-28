# IQX Next.js Starter Notes

This project is a compact Next.js starter used by IQX for first-prompt web builds.

- Treat the user's first prompt as the product brief, not as a request to preserve this starter.
- Keep the existing Next.js, React, TypeScript, Tailwind CSS, and shadcn-style structure unless the user explicitly asks for a different stack.
- Prefer editing `src/app/page.tsx`, `src/app/globals.css`, and focused components under `src/components`.
- Do not create standalone HTML files for app pages inside this Next.js project.
- If the task needs packages, update `package.json` first and let the runtime install from it.
- Use React Native or Expo-compatible APIs only inside mobile runtime files, not in this web starter.
