-- Add gender column to personas (male/female/any)
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'any';

-- Mark explicitly female personas based on names
UPDATE public.personas SET gender = 'female' WHERE name IN (
  'Daughter of Athens','Priestess of Athena','Achaemenid Queen','Veiled Scholar',
  'Princess of Thebes','Queen Consort','Queen of the Nile','Temple Dancer',
  'Lady of the Court','Onna-Bugeisha','Shieldmaiden','Forge Mistress',
  'Seer Volva','Völva Seer','Sail Weaver'
);

-- Mark explicitly male personas
UPDATE public.personas SET gender = 'male' WHERE name IN (
  'Aegean Captain','Geometer of Alexandria','Greek Philosopher','Lyric Poet',
  'Olympic Champion','Spartan Hoplite',
  'Cavalry of Cyrus','Immortal Guardian','Magi Astronomer','Nobleman of Shiraz',
  'Persian Court Poet','Persian King of Kings','Satrap of the Provinces',
  'Boy Pharaoh','Cartouche Carver','Chariot Captain','Court Astronomer',
  'Court Musician','Desert Pharaoh','Embalmer','Falconer of Horus',
  'Granary Overseer','High Priest of Amun','High Priest of Ra','Master Architect',
  'Master Goldsmith','Nubian General','Pharaoh''s General','Royal Physician',
  'Royal Scribe','Sphinx Guardian','Tomb Architect','Vizier',
  'Daimyo Lord','Daimyo of the Mountain','Imperial Archer','Ronin Master',
  'Ronin Wanderer','Samurai Archer','Samurai Lord','Tea Master','Warrior Monk',
  'Young Ashigaru',
  'Axe Champion','Blacksmith','Boatbuilder','Dragon-Prow Carver',
  'Falconer of the North','Forest Hunter','Forest Tracker','Fur Trader',
  'Greenland Explorer','Iceland Settler','Longship Captain','Mead Brewer',
  'Northern Berserker','Old Jarl','Skald Bard','Skald of the Hall',
  'Thingmoot Lawspeaker','Whale Hunter'
);

-- Map nationality (ISO code) → eligible civilization categories
CREATE TABLE IF NOT EXISTS public.nationality_categories (
  nationality_code text PRIMARY KEY,
  categories text[] NOT NULL
);

ALTER TABLE public.nationality_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nationality_categories_select_all" ON public.nationality_categories;
CREATE POLICY "nationality_categories_select_all"
ON public.nationality_categories FOR SELECT TO public USING (true);

INSERT INTO public.nationality_categories (nationality_code, categories) VALUES
  ('EG', ARRAY['Pharaoh']),
  ('SD', ARRAY['Pharaoh']),
  ('LY', ARRAY['Pharaoh']),
  ('GR', ARRAY['Greek']),
  ('CY', ARRAY['Greek']),
  ('IR', ARRAY['Persian']),
  ('AF', ARRAY['Persian']),
  ('TJ', ARRAY['Persian']),
  ('JP', ARRAY['Samurai']),
  ('NO', ARRAY['Viking']),
  ('SE', ARRAY['Viking']),
  ('DK', ARRAY['Viking']),
  ('IS', ARRAY['Viking']),
  ('FI', ARRAY['Viking'])
ON CONFLICT (nationality_code) DO UPDATE SET categories = EXCLUDED.categories;