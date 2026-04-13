import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchMalaysiaSpots() {
  console.log('Fetching regions...');
  const { data: regions, error: regionsError } = await supabase
    .from('regions')
    .select('id, name, country')
    .eq('country', 'Malaysia');

  if (regionsError) {
    console.error('Error fetching regions:', regionsError);
    return;
  }

  const regionIds = regions.map((r) => r.id);
  console.log(`Found ${regionIds.length} Malaysia regions.`);

  console.log('Fetching locations...');
  const { data: locations, error: locationsError } = await supabase
    .from('locations')
    .select('id, name, name_cn, address, opening_hours, region_id')
    .in('region_id', regionIds);

  if (locationsError) {
    console.error('Error fetching locations:', locationsError);
    return;
  }

  console.log(`Found ${locations.length} Malaysia locations.`);
  import fs from 'fs';
  fs.writeFileSync('malaysia-spots.json', JSON.stringify(locations, null, 2));
  console.log(`Saved ${locations.length} Malaysia locations to malaysia-spots.json`);
}

fetchMalaysiaSpots();
