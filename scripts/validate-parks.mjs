/**
 * Validates all park Wikipedia slugs and image availability.
 *
 * Usage: node scripts/validate-parks.mjs
 *
 * Checks:
 *  1. Wikipedia article exists (HTTP 200)
 *  2. Thumbnail image is available
 *
 * Reports broken slugs and missing images.
 */

import { PARKS } from "../src/parks-data.mjs";

const WIKI_API = "https://pt.wikipedia.org/api/rest_v1/page/summary/";
const CONCURRENCY = 5;
const DELAY_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkPark(park) {
  const url = `${WIKI_API}${park.slug}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { park, ok: false, status: res.status, hasImage: false };
    }
    const data = await res.json();
    const hasImage = !!data?.thumbnail?.source;
    return { park, ok: true, status: 200, hasImage, title: data.title };
  } catch (err) {
    return { park, ok: false, status: "NETWORK_ERROR", hasImage: false, error: err.message };
  }
}

async function main() {
  console.log(`\nValidating ${PARKS.length} parks...\n`);

  const results = [];
  for (let i = 0; i < PARKS.length; i += CONCURRENCY) {
    const batch = PARKS.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkPark));
    results.push(...batchResults);
    if (i + CONCURRENCY < PARKS.length) await sleep(DELAY_MS);
  }

  const broken = results.filter((r) => !r.ok);
  const noImage = results.filter((r) => r.ok && !r.hasImage);
  const valid = results.filter((r) => r.ok && r.hasImage);

  console.log(`  ✅ ${valid.length} parks with valid article + image`);
  console.log(`  ⚠️  ${noImage.length} parks with valid article but NO image`);
  console.log(`  ❌ ${broken.length} parks with broken/missing article\n`);

  if (noImage.length > 0) {
    console.log("Parks WITHOUT image:");
    noImage.forEach((r) =>
      console.log(`  - #${r.park.id} ${r.park.name} (${r.park.slug})`)
    );
    console.log();
  }

  if (broken.length > 0) {
    console.log("Parks with BROKEN slugs:");
    broken.forEach((r) =>
      console.log(
        `  - #${r.park.id} ${r.park.name} → status ${r.status} (slug: ${r.park.slug})`
      )
    );
    console.log();
  }

  if (broken.length > 0) {
    process.exit(1);
  }

  console.log("All Wikipedia links are valid! ✅\n");
}

main();
