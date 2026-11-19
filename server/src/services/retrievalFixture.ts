// Synthetic library and labelled questions for the retrieval benchmark (R9-02).
// Everything here is invented: no real note, person, place or account. Add cases freely, but keep them synthetic.
//
// A query lists the ids of the notes that answer it ("relevant"). `kind` says what the query exercises:
//   exact    - its distinctive words appear in the note
//   partial  - it shares only some words with the note (needs stemming or overlap, not an exact title match)
//   none     - nothing in the library answers it; retrieval should not put an unrelated note first with confidence

export interface FixtureNote {
  id: string
  title: string
  content: string
}

export interface FixtureQuery {
  query: string
  kind: 'exact' | 'partial' | 'none'
  relevant: string[]
}

export const NOTES: FixtureNote[] = [
  { id: 'n01', title: 'Lemon olive oil cake', content: 'Whisk eggs with sugar, fold in olive oil, lemon zest and flour. Bake the cake for forty minutes.' },
  { id: 'n02', title: 'Weeknight lentil soup', content: 'Simmer red lentils with carrots, cumin and garlic. Finish with lemon juice and parsley.' },
  { id: 'n03', title: 'Sourdough starter feeding schedule', content: 'Feed the sourdough starter daily with equal parts flour and water. Keep it warm for a stronger rise.' },
  { id: 'n04', title: 'Lisbon trip ideas', content: 'Tram twenty-eight, the Alfama viewpoints, custard tarts in Belem, and a day trip to Sintra palaces.' },
  { id: 'n05', title: 'Packing list for a mountain hike', content: 'Waterproof jacket, trekking poles, two litres of water, blister plasters and a paper map.' },
  { id: 'n06', title: 'Hotel booking in Osaka', content: 'Reserved a room near Namba station for six nights. Check-in after three in the afternoon.' },
  { id: 'n07', title: 'Laptop comparison: battery and weight', content: 'Model A lasts fourteen hours and weighs one point three kilograms. Model B has a brighter screen but weighs more.' },
  { id: 'n08', title: 'Home router setup notes', content: 'Change the default admin page address, enable the guest network and update the router firmware every quarter.' },
  { id: 'n09', title: 'Camera lens shortlist', content: 'Fast prime lens for portraits, a wide zoom for landscapes, and a macro lens for close up flowers.' },
  { id: 'n10', title: 'Index fund investing basics', content: 'Low cost index funds, regular monthly contributions, and rebalancing once a year keep the plan simple.' },
  { id: 'n11', title: 'Emergency fund target', content: 'Save six months of essential expenses in a separate savings account before investing more.' },
  { id: 'n12', title: 'Tax paperwork checklist', content: 'Collect salary slips, donation receipts and rent agreements before the filing deadline in July.' },
  { id: 'n13', title: 'Movies to watch this winter', content: 'A slow science fiction drama, a heist comedy from the nineties and a documentary about deep sea creatures.' },
  { id: 'n14', title: 'Book notes: habits and routines', content: 'Small daily habits compound. Attach a new routine to an existing cue and track it on a calendar.' },
  { id: 'n15', title: 'Podcast recommendations on history', content: 'An episode series about the Roman empire logistics and another about medieval trade routes.' },
  { id: 'n16', title: 'Knee rehab exercises', content: 'Straight leg raises, gentle cycling and hamstring stretches, three sets each, every other day.' },
  { id: 'n17', title: 'Sleep routine experiment', content: 'Lights out at eleven, no screens after ten, and a cool dark bedroom improved how rested I feel.' },
  { id: 'n18', title: 'Balcony herb garden plan', content: 'Basil and mint in sunny pots, thyme in a shallow box, water in the morning and avoid soggy soil.' },
  { id: 'n19', title: 'Fixing a dripping tap', content: 'Turn off the water, remove the handle, replace the worn washer and tighten the valve seat.' },
  { id: 'n20', title: 'Bike maintenance routine', content: 'Lubricate the chain monthly, check tyre pressure weekly and inspect the brake pads for wear.' },
  { id: 'n21', title: 'Team retrospective format', content: 'Three columns: what went well, what slowed us down, and one experiment to try next sprint.' },
  { id: 'n22', title: 'Interview preparation questions', content: 'Prepare a story about a failure, a disagreement with a colleague, and a project you led end to end.' },
  { id: 'n23', title: 'Spanish vocabulary: food and markets', content: 'Mercado, panadería, queso, aceite de oliva. Practise ordering fruit and bread aloud.' },
  { id: 'n24', title: 'Birthday gift ideas for parents', content: 'A framed family photo book, a cooking class voucher and a day out at the botanical garden.' },
]

export const QUERIES: FixtureQuery[] = [
  { query: 'olive oil cake recipe', kind: 'exact', relevant: ['n01'] },
  { query: 'lentil soup with cumin', kind: 'exact', relevant: ['n02'] },
  { query: 'how often to feed sourdough starter', kind: 'exact', relevant: ['n03'] },
  { query: 'Lisbon tram and custard tarts', kind: 'exact', relevant: ['n04'] },
  { query: 'what to pack for hiking in the mountains', kind: 'partial', relevant: ['n05'] },
  { query: 'where am I staying in Osaka', kind: 'partial', relevant: ['n06'] },
  { query: 'which laptop has the best battery life', kind: 'partial', relevant: ['n07'] },
  { query: 'router firmware and guest network', kind: 'exact', relevant: ['n08'] },
  { query: 'lens for portraits', kind: 'exact', relevant: ['n09'] },
  { query: 'index funds monthly contributions', kind: 'exact', relevant: ['n10'] },
  { query: 'how many months of expenses to save', kind: 'partial', relevant: ['n11'] },
  { query: 'documents needed for filing taxes', kind: 'partial', relevant: ['n12'] },
  { query: 'science fiction film to watch', kind: 'partial', relevant: ['n13'] },
  { query: 'building daily habits with cues', kind: 'partial', relevant: ['n14'] },
  { query: 'knee exercises after injury', kind: 'partial', relevant: ['n16'] },
  { query: 'bedroom and screens before sleep', kind: 'partial', relevant: ['n17'] },
  { query: 'basil and mint pots on the balcony', kind: 'exact', relevant: ['n18'] },
  { query: 'replace washer in a leaking tap', kind: 'partial', relevant: ['n19'] },
  { query: 'chain lubrication and brake pads', kind: 'partial', relevant: ['n20'] },
  { query: 'sprint retrospective columns', kind: 'exact', relevant: ['n21'] },
  { query: 'bread and fruit vocabulary in Spanish', kind: 'partial', relevant: ['n23'] },
  { query: 'gift for my parents birthday', kind: 'partial', relevant: ['n24'] },
  { query: 'quantum chromodynamics lattice simulation', kind: 'none', relevant: [] },
  { query: 'volcano evacuation procedure', kind: 'none', relevant: [] },
]
