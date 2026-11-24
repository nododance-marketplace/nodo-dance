## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## context7 (up-to-date library docs)

This project runs fast-moving dependencies: Next.js 16 (App Router, `--webpack` builds), React 18, Prisma 5, NextAuth v4, Tailwind 3, Leaflet, Cloudinary, Zod.

- Before writing or debugging code against any third-party library API, load the `context7` skill and use `npx ctx7 library "<name>" "<query>"` then `npx ctx7 docs <libraryId> "<query>"` instead of relying on training data.
- Version-specific questions must name the version (`next.js 16`, `prisma 5`).

## House workflow (senior-engineer standard)

The installed `.opencode/skills/` act as the engineering process for this repo. Follow them:

1. Non-trivial features start with the `spec-driven-development` skill, then `planning-and-task-breakdown`.
2. Implementation follows `incremental-implementation` (thin slices, commit each) and `test-driven-development` where logic is involved.
3. Before declaring any change done: run the build (`npm run build` — the webpack flag is required) and any touched tests.
4. Before merging or pushing significant changes, apply the `code-review-and-quality` skill; for anything touching user input, auth, or payments, also `security-and-hardening`.
5. UI work follows `frontend-ui-engineering`; performance claims require measurement (`performance-optimization`).
6. Node/deploy notes live in `docs/MEMORY.md` and `docs/build-fixes.md` — read before debugging build failures.
