# Vessel values and collision costs

Reviewed September 12, 2026. All baselines are USD estimates for an equivalent boat in maintained condition, allowing for the model and represented age. A 1997 yacht uses a comparable used-yacht value. The 2026 Cranchis use estimates for new or nearly new boats. Asking prices guide these rounded gameplay values; they are not confirmed sale prices or appraisals. Taxes, salvage, pollution cleanup and lost charter income are not included.

| Playable boat | Baseline | Basis |
| --- | ---: | --- |
| Bonum Vitae · Grand Banks 52 | $750,000 | Owner-provided value, retained as requested. |
| Serendipity · Nordhavn 86 | $6,500,000 | Comparable 2009/2010 N86 asking prices around $6.4–6.7m; [SALVATORE II at Northrop & Johnson](https://www.northropandjohnson.com/yachts-for-sale/salvatore-ii-86-nordhavn) lists $6.7m. This is a model comparable, not a claim that Serendipity is for sale. |
| Penalty Box III · Nordhavn 55 | $1,500,000 | Nordhavn's [pre-owned listings](https://nordhavn.com/brokerage/nordhavn-yachts-for-sale/) list the 2007 N55 GRAY WOLF at $1.495m. N55 production was 2005–2010 per [JMYS](https://nordhavn55.com/). |
| 2026 Cranchi E26 Rider | $225,000 | Rounded estimate for a commissioned new boat, informed by [E26 Rider listings](https://www.yachtworld.com/boats-for-sale/make-cranchi/model-e26-rider/). Search excerpts showed 2024/2025 examples around $192k/$204k; US 2026 listings request a price. Allows some headroom for newer equipment; not a dealer quote. |
| 2026 Cranchi Settantotto 78 | $5,000,000 | [SYS Yacht Sales' 2026 example](https://sysyachtsales.com/yacht-search/2026/cranchi-settantotto-78/10184730/) displayed approximately $4.84m USD. Rounded for equipment variation; foreign-currency conversions fluctuate. |
| 2005 Chris-Craft Corsair 36 | $175,000 | Older maintained example, rather than the highest advertised refit. [Corsair listings](https://www.boattrader.com/boats/make-chris-craft/model-corsair/) surfaced a 36 Heritage Edition at $169k; indexed comparable 36 listings varied from roughly $100k to $275k. |
| 1997 Crescent Custom 114 | $2,750,000 | [NOYA HILL at Seattle Yachts](https://www.seattleyachts.com/used-yachts-for-sale/114-crescent-custom-114-1997-noya-hill/2857067_1) is the same model/year and lists at $2.749m. |

The source of truth for playable boat values is `src/lib/boats/catalog.ts`. Every profile must provide a value. The boat profile page displays it before an exercise.

## Marina boats

Generated moored and passing boats do not have named models or build years. `smallCraftAsset` in `src/lib/boats/valuation.ts` estimates typical used-boat values from length, beam and sail/power type. A 10 m / 3.1 m powerboat starts at $160k; a sailboat of those dimensions at $90k. Value grows faster than length to account for accommodation, structure and machinery. Examples with a beam of 31% of length:

| Length | Powerboat | Sailboat |
| --- | ---: | ---: |
| 7 m | $55k | $37k |
| 10 m | $160k | $90k |
| 13 m | $352k | $173k |
| 15 m | $540k | $248k |

These are deliberately broad class estimates, not valuations of particular makes. The actual generated dimensions determine the value. The same boat retains that value throughout the exercise, regardless of which player boat strikes it.

## Shared loss rules

Both the player boat and struck boats use `estimateVesselDamageCost`. Hull repairs rise nonlinearly with damage; breaches, flooded machinery, drive damage and structural separation increase the estimate. Hull destruction, sinking, substantial breakup, or repairs reaching 80% of the baseline count as a total loss at 100% of the boat's baseline value.

Hits on other boats accumulate against their own damage state. Their visible flooding/fire progression updates the bill, so a vessel that sinks after the initial collision is also a total loss. Replacement supersedes earlier repairs to that vessel, and an extinguished fire does not erase incurred costs.

Dock bays, pilings and other boats remain separate from the player's vessel value. Destroyed sections are charged once, costs persist beyond the rolling incident feed, and restarting the exercise clears the ledger.
