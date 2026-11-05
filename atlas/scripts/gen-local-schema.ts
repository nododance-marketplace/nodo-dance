/**
 * Generates atlas/prisma/schema.local.prisma from prisma/schema.prisma.
 *
 * Why: the production datasource is Neon/Postgres and the pilot must never
 * write to production. The Nodo schema uses no Postgres-only features
 * (no enums, no arrays, no native types), so a faithful SQLite copy is
 * possible. One source of truth, no manual drift.
 *
 * Usage: npx tsx atlas/scripts/gen-local-schema.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(__dirname, '..', '..')
const sourcePath = resolve(root, 'prisma', 'schema.prisma')
const outPath = resolve(root, 'atlas', 'prisma', 'schema.local.prisma')

const source = readFileSync(sourcePath, 'utf8')

const output = source
  .replace(
    /generator client \{\s*provider = "prisma-client-js"\s*\}/,
    `generator client {
  provider = "prisma-client-js"
  output   = "../generated/local-client"
}`
  )
  .replace(
    /datasource db \{\s*provider  = "postgresql"\s*url       = env\("DATABASE_URL"\)\s*directUrl = env\("DIRECT_URL"\)\s*\}/,
    `datasource db {
  provider = "sqlite"
  url      = env("ATLAS_DATABASE_URL")
}`
  )

if (output === source) {
  console.error('[gen-local-schema] FAILED: no datasource/generator replacement applied. Schema shape changed — update this script.')
  process.exit(1)
}

if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, output, 'utf8')
console.log(`[gen-local-schema] wrote ${outPath}`)
