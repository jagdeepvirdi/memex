import { describe, it, expect } from 'vitest'
import { readdir, readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, 'migrations')
const SCHEMA_FILE = resolve(__dirname, 'schema.sql')

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR)
  return files.filter(f => f.endsWith('.sql')).sort()
}

function extractCreateTableNames(sql: string): string[] {
  const matches = sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)
  return [...matches].map(m => m[1].toLowerCase())
}

describe('schema.sql drift guard', () => {
  it('migration files are numbered sequentially with no gaps', async () => {
    const files = await getMigrationFiles()
    files.forEach((file, i) => {
      const num = parseInt(file.split('_')[0], 10)
      expect(num).toBe(i + 1)
    })
  })

  it('every table created in migrations is documented in schema.sql', async () => {
    const files = await getMigrationFiles()
    const schema = await readFile(SCHEMA_FILE, 'utf8')
    const schemaTableNames = new Set(extractCreateTableNames(schema))

    for (const file of files) {
      const sql = await readFile(resolve(MIGRATIONS_DIR, file), 'utf8')
      const migrationTables = extractCreateTableNames(sql)

      for (const table of migrationTables) {
        expect(
          schemaTableNames.has(table),
          `Table "${table}" from ${file} is missing in schema.sql`,
        ).toBe(true)
      }
    }
  })

  it('schema.sql comment reflects the correct migration count', async () => {
    const files = await getMigrationFiles()
    const schema = await readFile(SCHEMA_FILE, 'utf8')
    const countMatch = schema.match(/reflects all (\d+) migrations/)
    if (countMatch) {
      const documented = parseInt(countMatch[1], 10)
      expect(
        documented,
        `schema.sql says "reflects all ${documented} migrations" but ${files.length} migration files exist`,
      ).toBe(files.length)
    }
  })
})
