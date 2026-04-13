import { createClient } from '@supabase/supabase-js';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_PLACES_API_KEY) {
  console.error('Error: GOOGLE_PLACES_API_KEY is missing in .env.local');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function buildDayLabel(days) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (!days.length) return '';
  if (days.length === 1) return dayNames[days[0]];
  const isConsecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  return isConsecutive ? `${dayNames[days[0]]}-${dayNames[days[days.length - 1]]}` : days.map((day) => dayNames[day]).join(', ');
}

function formatGoogleOpeningHours(periods) {
  if (!periods || periods.length === 0) {
    return {
      isUnknown: true,
      open: "10:00",
      close: "22:00",
      closedDays: [],
      remarks: "无法从 Google Maps 提取准确时段",
      is24Hours: false,
      scheduleGroups: []
    };
  }
  
  if (periods.length === 1 && !periods[0].close && periods[0].open.day === 0 && periods[0].open.time === "0000") {
    return {
      isUnknown: false,
      open: "00:00",
      close: "23:59",
      closedDays: [],
      remarks: "24 小时营业",
      is24Hours: true,
      scheduleGroups: []
    };
  }

  const daySchedules = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  
  periods.forEach(p => {
    let openTime = p.open.time.substring(0, 2) + ":" + p.open.time.substring(2);
    let closeTime = "23:59";
    if (p.close) {
        closeTime = p.close.time.substring(0, 2) + ":" + p.close.time.substring(2);
    }
    daySchedules[p.open.day].push(`${openTime}-${closeTime}`);
  });

  const closedDays = [];
  const openDays = [];
  
  for (let i = 0; i < 7; i++) {
    if (daySchedules[i].length === 0) {
       closedDays.push(i);
    } else {
       openDays.push({ day: i, rangesStr: daySchedules[i].join(" / ") });
    }
  }

  const rangeCounts = {};
  openDays.forEach(od => {
    rangeCounts[od.rangesStr] = (rangeCounts[od.rangesStr] || 0) + 1;
  });
  
  let primaryRangeStr = null;
  let maxCount = 0;
  for (const r in rangeCounts) {
     if (rangeCounts[r] > maxCount) {
         maxCount = rangeCounts[r];
         primaryRangeStr = r;
     }
  }

  const isUniform = openDays.every(od => od.rangesStr === primaryRangeStr);
  const primaryRanges = primaryRangeStr ? primaryRangeStr.split(" / ") : ["10:00-22:00"];
  const openTimeMatch = primaryRanges[0].split("-")[0] || "10:00";
  const closeTimeMatch = primaryRanges[primaryRanges.length - 1].split("-")[1] || "22:00";

  const scheduleGroups = [];
  if (!isUniform) {
     const groups = {};
     openDays.forEach(od => {
         if (!groups[od.rangesStr]) groups[od.rangesStr] = [];
         groups[od.rangesStr].push(od.day);
     });
     for (const r in groups) {
         scheduleGroups.push({
             days: groups[r],
             label: buildDayLabel(groups[r]),
             hours: r
         });
     }
  }

  return {
      isUnknown: false,
      open: openTimeMatch,
      close: closeTimeMatch,
      closedDays: closedDays,
      remarks: isUniform ? "" : scheduleGroups.map(g => `${g.label} ${g.hours}`).join("\n"),
      is24Hours: false,
      scheduleGroups: isUniform ? [] : scheduleGroups
  };
}

async function searchGooglePlace(query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    return data.results[0].place_id;
  }
  return null;
}

async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,opening_hours&key=${GOOGLE_PLACES_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result;
}

async function updateSpots() {
  console.log('Fetching regions...');
  const { data: regions } = await supabase.from('regions').select('id, name, country').in('country', ['Malaysia', 'Japan', 'Indonesia']);
  if (!regions || regions.length === 0) return console.log('No eligible regions found.');

  const regionIds = regions.map(r => r.id);
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, name_cn, address, opening_hours, region_id')
    .in('region_id', regionIds);
    
  if (error || !locations) return console.log('Error fetching locations', error);
  console.log(`Ready to process ${locations.length} locations...`);

  let updatedCount = 0;
  for (const location of locations) {
      console.log(`\n[${location.id}] Processing: ${location.name_cn || location.name}...`);
      
      const locRegion = regions.find(r => r.id === location.region_id);
      const query = `${location.name} ${location.name_cn || ''} ${locRegion?.country || ''}`.trim();
      const placeId = await searchGooglePlace(query);
      
      if (!placeId) {
          console.log(`  => ❌ Could not find place on Google Maps for: ${query}`);
          continue;
      }
      
      const details = await getPlaceDetails(placeId);
      if (!details) {
          console.log(`  => ❌ Failed to get details for placeId: ${placeId}`);
          continue;
      }

      const updates = {};
      let madeChanges = false;

      // Address update
      if (details.formatted_address && details.formatted_address !== location.address) {
          updates.address = details.formatted_address;
          madeChanges = true;
          console.log(`  => Address changed: ${details.formatted_address}`);
      }

      // Opening hours update
      if (details.opening_hours) {
          const newStructuredHours = formatGoogleOpeningHours(details.opening_hours.periods);
          const newHoursJson = JSON.stringify(newStructuredHours);
          if (newHoursJson !== location.opening_hours) {
              updates.opening_hours = newHoursJson;
              madeChanges = true;
              console.log(`  => Opening hours updated.`);
          }
      }

      if (madeChanges) {
          const { error: updateError } = await supabase
              .from('locations')
              .update(updates)
              .eq('id', location.id);
          
          if (updateError) {
              console.error(`  => ❌ Supabase update error:`, updateError);
          } else {
              console.log(`  => ✅ Saved!`);
              updatedCount++;
          }
      } else {
          console.log(`  => = Up to date.`);
      }

      // Small delay to prevent Google Maps API rate limits
      await new Promise(res => setTimeout(res, 300));
  }
  
  console.log(`\\n🎉 Processed all locations. Total updated: ${updatedCount}`);
}

updateSpots();
