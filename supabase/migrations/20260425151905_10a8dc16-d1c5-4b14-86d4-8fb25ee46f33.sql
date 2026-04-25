ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS role text;

-- Royalty / rulers
UPDATE public.personas SET role = 'royalty' WHERE name IN (
  'Boy Pharaoh','Desert Pharaoh','Queen Consort','Queen of the Nile','Princess of Thebes',
  'Achaemenid Queen','Persian King of Kings','Nobleman of Shiraz','Satrap of the Provinces',
  'Daimyo Lord','Daimyo of the Mountain','Samurai Lord','Lady of the Court',
  'Old Jarl','Thingmoot Lawspeaker'
);

-- Warriors
UPDATE public.personas SET role = 'warrior' WHERE name IN (
  'Spartan Hoplite','Olympic Champion','Aegean Captain',
  'Cavalry of Cyrus','Immortal Guardian',
  'Chariot Captain','Nubian General','Pharaoh''s General','Sphinx Guardian',
  'Imperial Archer','Ronin Master','Ronin Wanderer','Samurai Archer','Warrior Monk','Young Ashigaru','Onna-Bugeisha',
  'Axe Champion','Northern Berserker','Shieldmaiden','Longship Captain','Whale Hunter'
);

-- Priests / mystics / seers
UPDATE public.personas SET role = 'priest' WHERE name IN (
  'Priestess of Athena',
  'High Priest of Amun','High Priest of Ra','Embalmer','Falconer of Horus','Falconer of the North',
  'Seer Volva','Völva Seer'
);

-- Scholars / wise (philosophers, scribes, astronomers, physicians, viziers)
UPDATE public.personas SET role = 'scholar' WHERE name IN (
  'Greek Philosopher','Geometer of Alexandria','Daughter of Athens',
  'Magi Astronomer','Veiled Scholar',
  'Court Astronomer','Royal Physician','Royal Scribe','Vizier','Granary Overseer'
);

-- Artists / musicians / poets / dancers
UPDATE public.personas SET role = 'artist' WHERE name IN (
  'Lyric Poet',
  'Persian Court Poet',
  'Court Musician','Temple Dancer',
  'Tea Master',
  'Skald Bard','Skald of the Hall'
);

-- Craftsmen / builders / makers
UPDATE public.personas SET role = 'craftsman' WHERE name IN (
  'Master Architect','Master Goldsmith','Cartouche Carver','Tomb Architect',
  'Blacksmith','Boatbuilder','Dragon-Prow Carver','Forge Mistress','Sail Weaver','Mead Brewer'
);

-- Explorers / hunters / traders / settlers
UPDATE public.personas SET role = 'explorer' WHERE name IN (
  'Forest Hunter','Forest Tracker','Fur Trader','Greenland Explorer','Iceland Settler'
);

-- Default the rest to 'noble'
UPDATE public.personas SET role = 'noble' WHERE role IS NULL;

ALTER TABLE public.personas ALTER COLUMN role SET DEFAULT 'noble';
ALTER TABLE public.personas ALTER COLUMN role SET NOT NULL;

CREATE INDEX IF NOT EXISTS personas_role_idx ON public.personas(role);