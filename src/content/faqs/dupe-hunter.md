---
title: Dupe Hunter
category: AI features
summary: How Dupe Hunter finds look-alikes today and after the nicoleDev release, what "nothing close enough" means, refunds, limits and catalogue gaps.
tags: [dupe, dupe-hunter, matching, catalogue, refunds, identical, close, similarity, lens]
order: 20
updated: 2026-10-07
status: partly-live
---

Dupe Hunter takes a photo of a piece a member likes and looks for affordable look-alikes **in Mila's own shop catalogue**. On the web it is the Dupe Hunter tab of the Studio Lens (the "Lens" button in the app's top bar). On mobile it is the Dupe Hunter tab of the Lens screen. Both use the same server.

A hunt costs **1 credit**.

## How it works

Both versions follow the same three steps, and both make **exactly one AI call per hunt**:

1. **One AI read of the photo.** The AI looks at her photo once and describes the piece.
2. **Our own catalogue.** The server takes the in-stock products in the same category from Mila's catalogue (up to 200).
3. **Matching.** The server compares the AI's description with each product's name and description, using fixed rules. No second AI call, and no picture-to-picture comparison.

What changes between the versions is how much the AI reports in step 1 and how strict step 3 is.

### Live today

- **The AI reports five things:** a name for the piece, one of 6 categories, its main colour, its undertone, and 2 to 4 shape words.
- **Matching gives every product in the same category 40 points** just for being in the category, then adds points for shape words, colour and palette, plus 15 points when the price fits the budget preference in her profile (budget, mid-range or investment pieces).
- **There is no minimum score.** The top 6 always come back whenever the category has 6 products within her budget and region, with ties going to the cheapest.
- **Bags and jewellery are not their own categories** in the AI's list, so a bag or a necklace is searched as "Accessories" and can return socks or belts.
- **The result:** a formal striped women's coat could come back with men's sports jackets, because every Outerwear product counted as a match.
- **Each card's match line** (the small line below the product name) always says "Same category (...)".
- **An empty hunt is charged.** The credit comes back only if the hunt stops with an error.

### After the nicoleDev release

**Step 1, a fuller read.** The AI now also reports:
- the exact garment type (coat, trench coat, blazer, puffer, track jacket and so on);
- womenswear, menswear or unisex;
- formality (formal, smart, casual, athletic);
- closure, pattern, colours, length, fabric and key details.

Bags and jewellery are their own categories. If the photo doesn't show the department, her profile gender is used.

**Step 3, rule-outs before scoring.** A product is never shown if:
- it is a different kind of garment (a fleece is not a coat; a related kind, such as a coat and a trench coat, only loses points);
- we can't tell what kind of garment it is from its name or the first sentence of its description, or the AI couldn't name the kind of garment in her photo;
- it is for the other department;
- its attire tag, name or description puts its formality two or more steps away (athletic is never formal or smart). When its text says nothing about formality, our usual guess for that kind (for example "sandals are casual") only lowers its score, so plain black sandals can still show for a formal hunt;
- the patterns conflict (a striped piece only matches products whose text names stripes; a plain piece never matches a product whose text names a print).

Formality is not checked for jewellery, bags and accessories, and pattern is not checked for jewellery.

**Similarity score, 0 to 100.** Garment kind weighs most, then formality, pattern and colour, then fabric, length, closure and details. Being in the same category earns **nothing** on its own.

**Fewer, honest results.** Only products scoring **60 or more** are shown, up to 6. If none reach 60, she gets none. The owner's ruling: no results are better than unrelated ones.

## "Nothing close enough yet"

This means **no product in our catalogue scored 60 or more** against what the AI read from her photo, before her budget and region filters were applied. Usually we simply don't stock anything like it yet. Sometimes the AI misread the piece, for example the wrong department, or a garment it couldn't name.

- The server's reply says, for example, "Nothing in our catalogue is close enough to this coat yet."
- The screens do not show that line yet. On the web she sees a pop-up, "No catalog matches yet", and a panel saying "No close matches in the catalog yet. Try a cleaner background or a different angle." On mobile she sees "No close matches in the catalogue yet. Try a cleaner background or a different angle."
- If the name shown under "Inspiration" on her result describes her piece, a different angle rarely helps, because the catalogue has no such piece. Be honest with her about that. If that name is wrong, a clearer photo of the piece on its own may help.

If close matches **do** exist but her **budget** or **region** hid them, the server's reply says so ("Close matches exist above your budget." or "...outside your region."). The screens do not show that line yet either.

## "Identical" and "close"

| Match quality | Score | What the card's match line says |
|---|---|---|
| Identical | 90 to 100 | "Same ..." for example "Same striped navy wool coat" |
| Close | 60 to 89 | "A similar ..." (or "Similar ..." for things that come in pairs), or for a related kind, for example "A trench coat close to your coat" |
| None | below 60 | Not shown |

> **Note:** Both cut-offs (60 and 90) were set from test examples, not from real member photos. They are **not yet calibrated**, so treat "Same" as "very close in our catalogue", never as "the exact product".

## Refunds

**Live today:** a hunt that returns nothing is charged. If the hunt stops with an error (any error, not only a failed AI read), the credit is refunded. How a refund is credited is in [Credits and refunds](/faqs/credits-and-refunds).

**After the nicoleDev release:**

- The credit is refunded when the hunt stops with an error, or when **our catalogue has nothing close at all**, judged **before** her budget and region filters.
- **At most 3 "nothing close" refunds per member in 24 hours.** The 24 hours start at her first refunded hunt. After 3, an empty hunt is charged like any other, with no error.
- If close matches exist but **her filters hid them**, she is **charged**. She got a real answer: those pieces exist, just above her budget or outside her region.
- If the refund limit can't be checked (a database hiccup), the hunt is charged and the problem is logged.
- If the hunt stops with an error, the credit is refunded as before, and that does not count toward the 3.
- The refunded credit goes back to where it came from. A purchased credit always comes back as a purchased credit. A daily credit refunded on the same credit day comes back in full. If the 8:00 am reset happened between the charge and the refund, the daily credit only tops today's daily credits up to her plan's daily amount, and if her plan has ended it is not given back. Until the tracked refunds update is applied in the database, refunds follow today's rule in [Credits and refunds](/faqs/credits-and-refunds).

## Rate limits

| Limit | Value | What she sees |
|---|---|---|
| Hunts | 15 per hour per member, counted from her first hunt in that hour | Web: "Too many requests. Please try again later." Mobile: "Mila needs a moment. Try again in N minutes." No credit is taken. |
| Refunded empty hunts (after the release) | 3 per 24 hours per member | Nothing. The 4th empty hunt is simply charged. |

## Catalogue coverage

Dupe Hunter can only find what Mila sells. The seeded catalogue has about **850 products in 8 categories**, and about **107 of them are Outerwear**.

- There is **no striped coat** in it at all. For the owner's striped Zara coat, the best honest answer today is "nothing close enough".
- Matching reads product **names and descriptions**. After the release, a product whose name (or the first sentence of its description) doesn't say what it is, such as "Stardust", is never shown by Dupe Hunter, and a missing detail lowers its score. Good catalogue text improves Dupe directly. See [Shop and catalogue](/faqs/shop-catalogue).
- After the release, a product's **attire** tag (shown on the admin Shop page), when set, overrides the formality read from its text. Most products don't have one yet, and the Shop page cannot edit it; it is a database change.
- Some products have the wrong gender value in the catalogue. After the release, the matcher trusts an explicit "women's" or "men's" in the product's name or description over that value.

## Why photo-to-photo search is not built

Today Dupe compares **words**: what the AI wrote about her photo against the words in product titles. Finding an **exact** look-alike needs comparing **pictures**.

That is being researched, not built. The research (2026-10-07) found:

- Fashion image models (the FashionCLIP family) can compare garment photos cheaply, but nothing proves they find the *same* piece between a phone photo and a shop photo. Published accuracy for the closest benchmark is about 55 to 57% for the right item first.
- Every production system crops the garment out of the photo first, and some cropping tools have licences we can't use commercially.
- "Identical" needs a cut-off tuned on our own labelled photos.
- Catalogue size limits "exact" more than any model does.
- Outside services were ruled out for now: Bing's visual search API was retired in 2025, and scraping other sites is not allowed.

The owner has seven decisions to make before any build (what Dupe promises, which model, cropping, a second AI check, catalogue growth, hosting, and image rights). Until then the method stays as described above. See [Known issues and owner actions](/faqs/known-issues-and-owner-actions).

## Recent fixes to the matching rules

Three rounds of review fixes landed on the `nicoleDev` branch on 2026-10-07:

- A few patterned products could appear for a plain piece, and a handful of products with a wrong gender value could show for both departments. Now a print, department or formality difference stated only in a product's description keeps that product out.
- An anklet or body chain could bring back necklaces marked as identical. Now "chain" means a necklace only for catalogue products, never for the photographed piece.
- A follow-up review of those fixes found a spiked bracelet whose description mentions studs showing in earring hunts, and casual jersey pieces dropping out of casual hunts. Now "stud" means an earring only in a product's name, jersey leans casual again (never for blazers, coats, shirts or blouses), "unisex" in a product's text beats a sizing note such as "men's sizing", and formal hunts find plain sandals, mules and flats again.

That last fix has not been reviewed yet.

## The free "similar pieces" shelf

Garments already found on a feed post have a free shelf of similar pieces. It uses the same catalogue matching **without** an AI call and **without** a credit. After the release it uses the same rule-outs and the 60 cut-off, so it may show fewer pieces than before.

## What to tell the member

**"Dupe Hunter showed me unrelated things."** (live today)
"Thanks for telling us. Dupe Hunter matches your photo against our own shop, and right now it can show pieces from the same category that aren't close. We're working on showing only real look-alikes."

**"It found nothing."**
- Live today: "Dupe Hunter only searches Mila's own shop. Right now an empty result usually means nothing of that type in our shop is at or under the budget you typed, or ships to your delivery country. The scan itself uses a credit. A new scan without a budget may show pieces from that category, but it uses another credit."
- After the release: "We don't stock anything close to that piece yet. When that happens we give the credit back, up to 3 times in 24 hours, counted from the first scan we refunded."

**"It found nothing, but I set a budget."** (after the release)
"We refund a hunt when our catalogue has nothing close to your piece, up to 3 times in 24 hours. If similar pieces exist but cost more than the budget you typed, or don't ship to your delivery country, the scan is charged. A new scan without a budget may show the ones above your budget, but it uses another credit."

**"Is this the exact same item?"**
"Dupe Hunter finds the closest look-alikes in Mila's shop. A 'Same' match is very close, but it's never a promise that it's the identical product."

**"It says too many requests."**
"Dupe Hunter allows 15 scans an hour, counted from your first scan. Please try again a little later; it can take up to an hour. That attempt didn't use a credit."

## Related articles

- [Credits and refunds](/faqs/credits-and-refunds)
- [Saved pieces and garment badges](/faqs/saved-pieces-and-garment-badges)
- [Shop and catalogue](/faqs/shop-catalogue)
- [AI settings](/faqs/ai-settings)
- [Known issues and owner actions](/faqs/known-issues-and-owner-actions)
