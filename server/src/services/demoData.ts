import type { Pool, PoolClient } from 'pg'
import { setItemCategories, setItemTags } from '../db/helpers.js'

// Sample data, so a new install can be tried without importing anything: about 40 generic items across every type. All of
// it is invented for this purpose or plain public fact (a film's director, a book's author); none of it is anyone's data.
//
// How it stays separate from the user's own library:
//   - every sample item carries `structured.demo = true`, so "clear" deletes exactly those and nothing else;
//   - sample entities (directors, authors, cities) are marked `metadata.demo` ONLY when this load created them. If the
//     user already has an entity of that name it is reused and left unmarked, so clearing can never delete it;
//   - loading calls no AI. The normal background worker embeds the items later, like any other note.

export type DemoType = 'note' | 'recipe' | 'media' | 'book' | 'place' | 'spec' | 'stock' | 'link'

export interface DemoEntity {
  name: string
  type: 'person' | 'place' | 'organization' | 'other'
  role: string
}

export interface DemoItem {
  title: string
  type: DemoType
  /** Root-first category path, from the canonical tree. */
  categories: string[]
  tags: string[]
  content: string
  structured: Record<string, unknown>
  intent?: 'actionable' | 'reference' | 'idea'
  sourceUrl?: string
  entities?: DemoEntity[]
}

const person = (name: string, role: string): DemoEntity => ({ name, type: 'person', role })
const city = (name: string): DemoEntity => ({ name, type: 'place', role: 'city' })

export const DEMO_ITEMS: DemoItem[] = [
  // ── Recipes ────────────────────────────────────────────────────────────────
  {
    title: 'Garlic and Olive Oil Pasta', type: 'recipe', categories: ['Food', 'Savory', 'Italian'], tags: ['pasta', 'quick', 'dinner'], intent: 'reference',
    content: 'A 15 minute weeknight pasta. Boil spaghetti in well salted water. Slowly warm sliced garlic in olive oil with chilli flakes until pale gold, then toss with the pasta, a splash of pasta water and chopped parsley.',
    structured: { ingredients: ['200g spaghetti', '4 cloves garlic', '60ml olive oil', 'chilli flakes', 'parsley', 'salt'], steps: ['Boil the spaghetti.', 'Warm the garlic gently in the oil.', 'Toss everything with a splash of pasta water.'], servings: '2', prepTime: '5 min', cookTime: '10 min', cuisine: 'Italian', mealType: 'dinner' },
  },
  {
    title: 'Chicken Tikka Masala', type: 'recipe', categories: ['Food', 'Savory', 'Indian'], tags: ['curry', 'chicken', 'dinner'], intent: 'actionable',
    content: 'Marinate chicken in yoghurt, garam masala and lemon for an hour, grill until charred, then simmer in a sauce of onion, tomato, cream and spices. Serve with rice or naan.',
    structured: { ingredients: ['500g chicken thigh', '150g yoghurt', '2 tsp garam masala', '1 onion', '400g tomatoes', '100ml cream'], steps: ['Marinate the chicken.', 'Grill until charred.', 'Simmer in the tomato and cream sauce.'], servings: '4', prepTime: '20 min', cookTime: '40 min', cuisine: 'Indian', mealType: 'dinner' },
  },
  {
    title: 'Pad Thai', type: 'recipe', categories: ['Food', 'Savory', 'Thai'], tags: ['noodles', 'thai', 'dinner'], intent: 'reference',
    content: 'Stir fry rice noodles with tamarind sauce, fish sauce and palm sugar. Add egg, tofu or prawns, bean sprouts and chives, and finish with crushed peanuts and a squeeze of lime.',
    structured: { ingredients: ['200g rice noodles', '3 tbsp tamarind paste', '2 tbsp fish sauce', 'palm sugar', '2 eggs', 'bean sprouts', 'peanuts', 'lime'], steps: ['Soak the noodles.', 'Fry the egg and protein.', 'Add noodles and sauce and toss.', 'Top with peanuts and lime.'], servings: '2', prepTime: '15 min', cookTime: '10 min', cuisine: 'Thai', mealType: 'dinner' },
  },
  {
    title: 'Banana Bread', type: 'recipe', categories: ['Food', 'Bakery', 'Bread'], tags: ['baking', 'banana', 'snack'], intent: 'reference',
    content: 'A forgiving loaf for overripe bananas. Mash three bananas, mix with melted butter, sugar, an egg, flour and baking soda, and bake until a skewer comes out clean.',
    structured: { ingredients: ['3 ripe bananas', '75g butter', '150g sugar', '1 egg', '190g flour', '1 tsp baking soda'], steps: ['Mash the bananas.', 'Mix in butter, sugar and egg.', 'Fold in flour and baking soda.', 'Bake at 175C for 55 minutes.'], servings: '8', prepTime: '10 min', cookTime: '55 min', cuisine: 'American', mealType: 'snack' },
  },
  {
    title: 'Chocolate Chip Cookies', type: 'recipe', categories: ['Food', 'Bakery', 'Cookies'], tags: ['baking', 'cookies', 'dessert'], intent: 'idea',
    content: 'Chewy cookies with crisp edges. Brown the butter first, rest the dough overnight, and use a mix of chopped chocolate and chips. Flaky salt on top.',
    structured: { ingredients: ['225g brown butter', '200g brown sugar', '2 eggs', '280g flour', '200g chopped chocolate', 'flaky salt'], steps: ['Brown the butter and cool it.', 'Mix the dough and rest it overnight.', 'Bake at 180C for 11 minutes.'], servings: '18', prepTime: '20 min', cookTime: '11 min', cuisine: 'American', mealType: 'dessert' },
  },
  {
    title: 'Classic Vanilla Cake', type: 'recipe', categories: ['Food', 'Bakery', 'Cakes'], tags: ['baking', 'cake', 'birthday'], intent: 'actionable',
    content: 'A tender two layer vanilla sponge with buttercream, for birthdays. Cream the butter and sugar well, add the eggs one at a time, and alternate flour and milk.',
    structured: { ingredients: ['225g butter', '200g sugar', '4 eggs', '250g flour', '120ml milk', '2 tsp vanilla'], steps: ['Cream butter and sugar.', 'Beat in the eggs.', 'Alternate flour and milk.', 'Bake two layers and fill with buttercream.'], servings: '12', prepTime: '30 min', cookTime: '30 min', cuisine: 'International', mealType: 'dessert' },
  },

  // ── Movies ─────────────────────────────────────────────────────────────────
  {
    title: 'Inception', type: 'media', categories: ['Media', 'Movies', 'Action'], tags: ['sci-fi', 'heist'], intent: 'reference',
    content: 'A thief who steals secrets from dreams is asked to plant an idea instead. Layered dreams, a ticking clock and a spinning top.',
    structured: { genre: 'Sci-Fi / Action', year: 2010, director: 'Christopher Nolan', cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'], watchStatus: 'watched', watched: true, userRating: 5, summary: 'A heist inside layered dreams.' },
    entities: [person('Christopher Nolan', 'director')],
  },
  {
    title: 'The Godfather', type: 'media', categories: ['Media', 'Movies', 'Drama'], tags: ['classic', 'crime'], intent: 'reference',
    content: 'The ageing head of a crime family hands control to his reluctant youngest son. A study of power, loyalty and family.',
    structured: { genre: 'Crime / Drama', year: 1972, director: 'Francis Ford Coppola', cast: ['Marlon Brando', 'Al Pacino', 'James Caan'], watchStatus: 'watched', watched: true, userRating: 5, summary: 'A crime family changes hands.' },
    entities: [person('Francis Ford Coppola', 'director')],
  },
  {
    title: 'The Shining', type: 'media', categories: ['Media', 'Movies', 'Horror'], tags: ['horror', 'classic'], intent: 'reference',
    content: 'A writer takes a winter caretaker job at an isolated hotel and slowly loses his grip. Long corridors and a famous typewriter.',
    structured: { genre: 'Horror', year: 1980, director: 'Stanley Kubrick', cast: ['Jack Nicholson', 'Shelley Duvall'], watchStatus: 'want-to-watch', watched: false, summary: 'Isolation and a haunted hotel.' },
    entities: [person('Stanley Kubrick', 'director')],
  },
  {
    title: 'The Grand Budapest Hotel', type: 'media', categories: ['Media', 'Movies', 'Comedy'], tags: ['comedy', 'stylised'], intent: 'idea',
    content: 'A legendary concierge and his young lobby boy are drawn into the theft of a priceless painting. Symmetrical shots and pastel colours.',
    structured: { genre: 'Comedy / Adventure', year: 2014, director: 'Wes Anderson', cast: ['Ralph Fiennes', 'Tony Revolori'], watchStatus: 'want-to-watch', watched: false, summary: 'A concierge, a painting and a lot of pastel.' },
    entities: [person('Wes Anderson', 'director')],
  },
  {
    title: 'Parasite', type: 'media', categories: ['Media', 'Movies', 'Drama'], tags: ['thriller', 'award-winner'], intent: 'reference',
    content: 'A poor family schemes its way into the lives of a wealthy one, until the plan unravels. A sharp look at class.',
    structured: { genre: 'Thriller / Drama', year: 2019, director: 'Bong Joon-ho', cast: ['Song Kang-ho', 'Choi Woo-shik'], watchStatus: 'watching', watched: false, summary: 'Class, schemes and a basement.' },
    entities: [person('Bong Joon-ho', 'director')],
  },
  {
    title: 'Mad Max: Fury Road', type: 'media', categories: ['Media', 'Movies', 'Action'], tags: ['action', 'chase'], intent: 'idea',
    content: 'A feature length chase across a desert wasteland with practical stunts and almost no dialogue.',
    structured: { genre: 'Action', year: 2015, director: 'George Miller', cast: ['Tom Hardy', 'Charlize Theron'], watchStatus: 'want-to-watch', watched: false, summary: 'One long chase.' },
    entities: [person('George Miller', 'director')],
  },

  // ── Books ──────────────────────────────────────────────────────────────────
  {
    title: 'Dune', type: 'book', categories: ['Media', 'Books', 'Fiction'], tags: ['sci-fi', 'classic'], intent: 'reference',
    content: 'A young heir takes his family to a desert planet that holds the most valuable substance in the universe. Politics, ecology and prophecy.',
    structured: { author: 'Frank Herbert', genre: 'Science fiction', year: 1965, status: 'read', userRating: 5, highlights: ['Fear is the mind-killer.'], summary: 'Power and ecology on a desert planet.' },
    entities: [person('Frank Herbert', 'author')],
  },
  {
    title: 'Sapiens', type: 'book', categories: ['Media', 'Books', 'Non-Fiction'], tags: ['history', 'big-picture'], intent: 'reference',
    content: 'A short history of humankind, from early foragers to the present, built around the idea that shared stories let large groups cooperate.',
    structured: { author: 'Yuval Noah Harari', genre: 'History', year: 2011, status: 'reading', userRating: 4, summary: 'Why shared stories matter.' },
    entities: [person('Yuval Noah Harari', 'author')],
  },
  {
    title: 'The Pragmatic Programmer', type: 'book', categories: ['Media', 'Books', 'Technical'], tags: ['programming', 'craft'], intent: 'reference',
    content: 'Practical advice for working programmers: care about the craft, automate the boring parts, and keep your tools sharp.',
    structured: { author: 'Andrew Hunt and David Thomas', genre: 'Software', year: 1999, status: 'want-to-read', summary: 'Habits of a good programmer.' },
    entities: [person('Andrew Hunt', 'author'), person('David Thomas', 'author')],
  },
  {
    title: 'The Left Hand of Darkness', type: 'book', categories: ['Media', 'Books', 'Fiction'], tags: ['sci-fi', 'classic'], intent: 'idea',
    content: 'An envoy visits a winter world whose people have no fixed gender, and learns to trust a local politician across a frozen journey.',
    structured: { author: 'Ursula K. Le Guin', genre: 'Science fiction', year: 1969, status: 'want-to-read', summary: 'An envoy on a winter world.' },
    entities: [person('Ursula K. Le Guin', 'author')],
  },

  // ── Places (venue names are invented) ──────────────────────────────────────
  {
    title: 'Kyoto: temples and gardens', type: 'place', categories: ['Travel', 'Destinations'], tags: ['japan', 'temples', 'spring'], intent: 'actionable',
    content: 'Early morning at Fushimi Inari, Kinkaku-ji in the afternoon, the Arashiyama bamboo grove at sunset. Avoid the weekend crowds if possible.',
    structured: { name: 'Kyoto', type: 'destination', city: 'Kyoto', country: 'Japan', visitStatus: 'want-to-visit', userRating: 5, notes: 'Go in spring.' },
    entities: [city('Kyoto')],
  },
  {
    title: 'Riverside Bakery', type: 'place', categories: ['Travel', 'Restaurants'], tags: ['cafe', 'breakfast', 'lisbon'], intent: 'reference',
    content: 'A small corner bakery with excellent custard tarts and strong coffee. Gets busy by nine.',
    structured: { name: 'Riverside Bakery', type: 'cafe', cuisine: 'Bakery', city: 'Lisbon', country: 'Portugal', visitStatus: 'visited', userRating: 5, priceRange: '$', notes: 'Order the custard tart.' },
    entities: [city('Lisbon')],
  },
  {
    title: 'Harbour Noodle House', type: 'place', categories: ['Travel', 'Restaurants'], tags: ['noodles', 'lunch'], intent: 'reference',
    content: 'Hand pulled noodles and a short menu near the harbour. Cash only at lunchtime.',
    structured: { name: 'Harbour Noodle House', type: 'restaurant', cuisine: 'Noodles', city: 'Lisbon', country: 'Portugal', visitStatus: 'want-to-revisit', userRating: 4, priceRange: '$$', notes: 'Cash only at lunch.' },
    entities: [city('Lisbon')],
  },
  {
    title: 'Old Town Boutique Hotel', type: 'place', categories: ['Travel', 'Hotels'], tags: ['hotel', 'quiet'], intent: 'reference',
    content: 'A quiet twelve room hotel in a restored townhouse with a good breakfast and a rooftop terrace.',
    structured: { name: 'Old Town Boutique Hotel', type: 'hotel', city: 'Lisbon', country: 'Portugal', visitStatus: 'visited', userRating: 4, priceRange: '$$$', notes: 'Ask for a room facing the courtyard.' },
    entities: [city('Lisbon')],
  },
  {
    title: 'Skyline Observatory', type: 'place', categories: ['Travel', 'Attractions'], tags: ['views', 'sunset'], intent: 'idea',
    content: 'A public viewing deck at the top of a tower, best at sunset. Book the slot online to skip the queue.',
    structured: { name: 'Skyline Observatory', type: 'attraction', city: 'Kyoto', country: 'Japan', visitStatus: 'want-to-visit', notes: 'Book the sunset slot.' },
    entities: [city('Kyoto')],
  },

  // ── Specs ──────────────────────────────────────────────────────────────────
  {
    title: 'Ultralight laptop: what to look for', type: 'spec', categories: ['Tech', 'Laptops'], tags: ['laptop', 'buying-guide'], intent: 'reference',
    content: 'Under 1.3kg, 16GB RAM minimum, a bright matte screen, at least ten hours of real battery life, and a keyboard you like typing on.',
    structured: { weight: '1.3kg or less', ram: '16GB minimum', screen: 'bright, matte', battery: '10 hours real use' },
  },
  {
    title: 'Mirrorless camera shortlist', type: 'spec', categories: ['Tech', 'Cameras'], tags: ['camera', 'photography'], intent: 'idea',
    content: 'Looking for a compact body with good low light performance, in body stabilisation and a wide choice of lenses.',
    structured: { sensor: 'APS-C or full frame', stabilisation: 'in body', priority: 'low light', budget: 'mid range' },
  },
  {
    title: 'Phone checklist', type: 'spec', categories: ['Tech', 'Phones'], tags: ['phone', 'buying-guide'], intent: 'reference',
    content: 'Five years of updates, a battery that lasts a full day, a good main camera and a repairable design.',
    structured: { updates: '5 years', battery: 'full day', camera: 'good main sensor', repairable: true },
  },
  {
    title: 'Home server build', type: 'spec', categories: ['Tech', 'Specs'], tags: ['homelab', 'hardware'], intent: 'actionable',
    content: 'A quiet low power machine for backups and media: a small case, four drive bays, 32GB RAM and a processor that idles at under ten watts.',
    structured: { case: 'small, four bays', ram: '32GB', idlePower: 'under 10W', storage: '4 x 4TB' },
  },

  // ── Stocks and finance notes ───────────────────────────────────────────────
  {
    title: 'AAPL', type: 'stock', categories: ['Finance', 'Stocks'], tags: ['watchlist', 'tech'], intent: 'reference',
    content: 'On the watchlist. Reading the quarterly results and how services revenue is growing.',
    structured: { ticker: 'AAPL', exchange: 'NASDAQ' },
  },
  {
    title: 'MSFT', type: 'stock', categories: ['Finance', 'Stocks'], tags: ['watchlist', 'tech'], intent: 'reference',
    content: 'On the watchlist. Following cloud growth and how it is guided each quarter.',
    structured: { ticker: 'MSFT', exchange: 'NASDAQ' },
  },
  {
    title: 'Index funds in plain words', type: 'note', categories: ['Finance', 'Notes'], tags: ['investing', 'basics'], intent: 'reference',
    content: 'An index fund holds every company in a market index, so fees stay low and the money is spread widely. The trade off is that you get the market return, no more and no less.',
    structured: { summary: 'Low fees and broad spread, at the market return.' },
  },

  // ── Links (example.com addresses) ──────────────────────────────────────────
  {
    title: 'How HTTP caching works', type: 'link', categories: ['Links', 'Articles'], tags: ['web', 'performance'], intent: 'reference', sourceUrl: 'https://example.com/articles/http-caching',
    content: 'A clear walk through Cache-Control, ETags and when a browser revalidates, with a table of common header combinations.',
    structured: { summary: 'Cache-Control, ETags and revalidation explained.' },
  },
  {
    title: 'A guide to sourdough starters', type: 'link', categories: ['Links', 'Articles'], tags: ['baking', 'sourdough'], intent: 'actionable', sourceUrl: 'https://example.com/articles/sourdough-starter',
    content: 'Feed equal weights of flour and water daily, keep it warm, and expect bubbles in about a week.',
    structured: { summary: 'Getting a starter going in a week.' },
  },
  {
    title: 'Writing a good commit message', type: 'link', categories: ['Links', 'Docs'], tags: ['git', 'writing'], intent: 'reference', sourceUrl: 'https://example.com/docs/commit-messages',
    content: 'A short subject line, a blank line, then a body that explains why the change was made, not just what changed.',
    structured: { summary: 'Subject line, blank line, then the why.' },
  },
  {
    title: 'Slow travel: staying a month in one city', type: 'link', categories: ['Links', 'Articles'], tags: ['travel', 'slow-travel'], intent: 'idea', sourceUrl: 'https://example.com/articles/slow-travel',
    content: 'Why a month in one place beats a week in four, and how to find a short rental that feels like home.',
    structured: { summary: 'A month in one city beats a week in four.' },
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  {
    title: 'Weekly review checklist', type: 'note', categories: ['Tech'], tags: ['routine', 'productivity'], intent: 'actionable',
    content: 'Clear the inbox, review the calendar for next week, update the project list, and pick three things that matter most.',
    structured: { summary: 'Four steps for a calm Monday.' },
  },
  {
    title: 'Meeting notes template', type: 'note', categories: ['Tech'], tags: ['template', 'work'], intent: 'reference',
    content: 'Date and attendees, the decision we need, notes, then actions with an owner and a date.',
    structured: { summary: 'Decision, notes, actions with owners.' },
  },
  {
    title: 'Weekend packing list', type: 'note', categories: ['Travel'], tags: ['packing', 'checklist'], intent: 'actionable',
    content: 'Charger, light jacket, reusable water bottle, a book, comfortable shoes and a small first aid kit.',
    structured: { summary: 'The short list for a weekend away.' },
  },
  {
    title: 'Weekly meal plan', type: 'note', categories: ['Food'], tags: ['planning', 'dinner'], intent: 'actionable',
    content: 'Monday pasta, Tuesday curry, Wednesday leftovers, Thursday noodles, Friday pizza. Shop on Sunday.',
    structured: { summary: 'Five dinners and one shopping trip.' },
  },
  {
    title: 'Ideas for a small side project', type: 'note', categories: ['Tech'], tags: ['ideas', 'projects'], intent: 'idea',
    content: 'A tiny tool that turns a folder of notes into a searchable site, or a reading list that reminds me what I never finished.',
    structured: { summary: 'Two small project ideas.' },
  },
  {
    title: 'Questions to ask when learning anything new', type: 'note', categories: ['Tech'], tags: ['learning', 'thinking'], intent: 'idea',
    content: 'What is the smallest useful thing I can build with this? What would an expert find obvious? What am I assuming?',
    structured: { summary: 'Three questions that speed up learning.' },
  },
  {
    title: 'Keyboard shortcuts worth learning', type: 'note', categories: ['Tech'], tags: ['productivity', 'shortcuts'], intent: 'reference',
    content: 'Switch windows, search everything, jump to the start or end of a line, reopen a closed tab and undo a close.',
    structured: { summary: 'Small shortcuts, big saving.' },
  },
]

export const DEMO_TAGS: string[] = [...new Set(DEMO_ITEMS.flatMap((i) => i.tags))]

type Db = Pick<Pool, 'query'>

/** How many sample items are loaded right now. */
export async function demoCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM items WHERE structured->>'demo' = 'true' AND deleted_at IS NULL")
  return Number(rows[0]?.n ?? 0)
}

export class DemoAlreadyLoadedError extends Error {
  constructor() {
    super('Sample data is already loaded. Clear it first to load it again.')
    this.name = 'DemoAlreadyLoadedError'
  }
}

/**
 * Loads the sample items in ONE transaction (all or nothing). Refuses when sample data is already there. Calls no AI.
 * Returns how many items it created.
 */
export async function loadDemoData(client: PoolClient): Promise<number> {
  await client.query('BEGIN')
  try {
    const n = await insertDemoData(client)
    await client.query('COMMIT')
    return n
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

/** The inserts of `loadDemoData` without its own transaction, so a caller (or a test) can wrap it. */
export async function insertDemoData(client: PoolClient): Promise<number> {
  if ((await demoCount(client)) > 0) throw new DemoAlreadyLoadedError()
  {
    const entityIds = new Map<string, string>()
    for (const item of DEMO_ITEMS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO items (title, type, content, structured, source, source_url, reviewed, confidence, intent)
         VALUES ($1, $2, $3, $4, 'manual', $5, true, 95, $6) RETURNING id`,
        [item.title, item.type, item.content, JSON.stringify({ ...item.structured, demo: true }), item.sourceUrl ?? null, item.intent ?? null],
      )
      const id = rows[0].id
      await setItemCategories(client, id, item.categories)
      await setItemTags(client, id, item.tags)

      for (const e of item.entities ?? []) {
        const key = `${e.type}:${e.name}`
        let entityId = entityIds.get(key)
        if (!entityId) {
          // Created by this load: marked as sample. Already there (the user's own): reused and left unmarked.
          const made = await client.query<{ id: string }>(
            `INSERT INTO entities (name, type, metadata) VALUES ($1, $2, '{"demo": true}'::jsonb)
             ON CONFLICT (name, type) DO NOTHING RETURNING id`,
            [e.name, e.type],
          )
          entityId = made.rows[0]?.id
          if (!entityId) {
            const existing = await client.query<{ id: string }>('SELECT id FROM entities WHERE name = $1 AND type = $2', [e.name, e.type])
            entityId = existing.rows[0].id
          }
          entityIds.set(key, entityId)
        }
        await client.query('INSERT INTO item_entities (item_id, entity_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, entityId, e.role])
      }
    }
    return DEMO_ITEMS.length
  }
}

export interface DemoClearResult {
  items: number
  entities: number
  tags: number
}

/**
 * Deletes exactly the sample items (and what only they used): their links, the entities this load created that nothing else
 * links to, and the sample tags nothing else uses. Everything the user made is left alone. An entity that something else
 * now links to is kept and stops being marked as sample.
 */
export async function clearDemoData(client: PoolClient): Promise<DemoClearResult> {
  await client.query('BEGIN')
  try {
    const result = await deleteDemoData(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

/** The deletes of `clearDemoData` without its own transaction. */
export async function deleteDemoData(client: PoolClient): Promise<DemoClearResult> {
  {
    const items = await client.query("DELETE FROM items WHERE structured->>'demo' = 'true'")
    const entities = await client.query(
      `DELETE FROM entities e WHERE e.metadata->>'demo' = 'true'
         AND NOT EXISTS (SELECT 1 FROM item_entities ie WHERE ie.entity_id = e.id)`,
    )
    await client.query("UPDATE entities SET metadata = metadata - 'demo' WHERE metadata->>'demo' = 'true'")
    const tags = await client.query(
      `DELETE FROM tags t WHERE t.name = ANY($1) AND NOT EXISTS (SELECT 1 FROM item_tags it WHERE it.tag_id = t.id)`,
      [DEMO_TAGS],
    )
    return { items: items.rowCount ?? 0, entities: entities.rowCount ?? 0, tags: tags.rowCount ?? 0 }
  }
}
