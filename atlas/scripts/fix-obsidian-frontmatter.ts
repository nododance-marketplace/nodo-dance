import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Normalises the Atlas note frontmatter into valid YAML.
 *
 * The vault's existing notes use a single-line pipe form:
 *   title: X | type: Y | status: Z | evidence: W
 * That is not valid YAML (the value contains ": ") so Obsidian's Properties
 * view cannot read it. This rewrites the Atlas notes into proper multi-line
 * YAML with the same keys, same order and the same values.
 */

const DIR = 'D:\\Obsidian\\El Moi Vault\\Moi Vault\\second-brain\\projects\\nodo-dance\\Atlas'

function quote(value: string): string {
  const v = value.trim()
  if (v === '') return '""'
  if (/[:#\[\]{},"']/.test(v) || /^\s|\s$/.test(v)) return `"${v.replace(/"/g, '\\"')}"`
  return v
}

let changed = 0

for (const file of readdirSync(DIR).filter(f => f.endsWith('.md'))) {
  const path = join(DIR, file)
  const content = readFileSync(path, 'utf8')

  const pipeMatch = content.match(
    /^---\r?\ntitle: (.+?) \| type: (.+?) \| status: (.+?) \| evidence: (.+?)\r?\nowner: (.+?)\r?\nlast_reviewed: (.+?)\r?\nrelated: (.+?)\r?\ntags: (.+?)\r?\n---/m
  )
  if (!pipeMatch) continue

  const [, title, type, status, evidence, owner, lastReviewed, related, tags] = pipeMatch
  const replacement = [
    '---',
    `title: ${quote(title)}`,
    `type: ${quote(type)}`,
    `status: ${quote(status)}`,
    `evidence: ${quote(evidence)}`,
    `owner: ${quote(owner)}`,
    `last_reviewed: ${quote(lastReviewed)}`,
    `related: ${quote(related)}`,
    `tags: ${quote(tags)}`,
    '---',
  ].join('\n')

  writeFileSync(path, content.replace(pipeMatch[0], replacement), 'utf8')
  changed++
  console.log(`  ✓ ${file}`)
}

console.log(`\n${changed} note(s) converted to valid YAML frontmatter.`)
