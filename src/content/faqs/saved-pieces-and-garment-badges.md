---
title: Saved pieces and garment badges
category: Shop & catalogue
summary: What members see when they save a recommended piece, how each garment badge label is chosen, and the six catalogue rows filed under the wrong category.
tags: [saved, bookmark, badges, garment, labels, catalogue, shop, categories]
order: 20
updated: 2026-10-07
status: coming
---

Two features arrive together with the nicoleDev release, on web and on mobile:

- **Saved pieces:** a bookmark on every piece Mila recommends, and a page that keeps them.
- **Garment badges:** a small label on every recommended product photo that says which piece Mila means.

**Live today, neither exists.** Recommended products show no badge and cannot be saved.

> **Important:** Saved pieces also need the database migration `20261007120000_saved_products.sql`, which is not applied yet. Until it is, the bookmark stays hidden even after the code is merged, and the page shows a calm "not switched on yet" message. Garment badges need no migration. Mobile members get both only after a new app build. See [Environments and releases](/faqs/environments-and-releases).

## Where these show up

| Place | Web | Mobile |
|---|---|---|
| Shop This Look (under her look) | Badge and bookmark on every piece | Badge and bookmark on every piece |
| Dupe Hunter results | Badge and bookmark on every match | Badge and bookmark on every match (Lens, Dupe mode) |
| A feed post's shop of similar pieces | Badge and bookmark in the post's Shop tab | Badge and bookmark in the garment sheet |
| Saved pieces page | Badge on every saved piece | Badge on every saved piece |

## Saved pieces: what members see

### Saving

- A **bookmark button** sits in the top-right corner of each recommended product.
- Tapping it saves the piece. On the web a message says "Saved. It will wait for you in Saved pieces." with a **View** link.
- Tapping again removes it. Saving the same product twice keeps one copy.
- She can save pieces from her own looks, from Dupe Hunter, and from **other members' feed posts**.

### Finding them again

- **Web:** **Saved pieces** in the sidebar, right after Palettes. On a phone browser there is a **Saved pieces** row in her account area, and a **Saved pieces** link inside the Shop This Look section, above the pieces.
- **Mobile app:** a **Saved pieces** row in the account sheet, right after Outfit archive, and a link in the Shop This Look header.

### The Saved pieces page

- Pieces are grouped by kind under headings. On the web the order is Outerwear, Tops, Dresses, Bottoms, Shoes, Bags, Jewelry, Accessories, then Other pieces, and each heading shows a count. In the app the order is Tops, Bottoms, Dresses, Outerwear, Shoes, Bags, Jewelry, Accessories, then Other pieces, with no count.
- Each card shows the garment badge, the label and product name, the brand and the price. On the web it also says where it was saved from ("From your look", "From Dupe Hunter" or "From the feed") and when. The app does not show where it was saved from.
- If the product can still be bought, there is a **Shop** link to the shop's page.
- Otherwise there is no Shop link, and the card says why. On the web: **No longer available**, **Out of stock** or **Link unavailable**, and the photo is dimmed. In the app: **No longer available**, **Out of stock right now** or **The shop link isn't working right now**, and the photo is not dimmed.
- **Remove** takes it off the list. In the app she confirms first ("Remove this piece?"). It works even for a product that has left the catalogue.
- Empty page: "Tap the bookmark on any piece Mila recommends and it will wait here." on the web, and "Tap the bookmark on any piece Mila recommends and it waits here." in the app.

### What is stored

- When she saves a piece, the **database** copies the product's name, photo, link, price, currency, category and brand at that moment. Whatever the app sends is ignored, so the copy always matches the catalogue.
- That copy is why a piece removed from the catalogue still shows on her page, marked No longer available.
- Saved pieces are **private**. Only she can see or change her list. Staff cannot see saved pieces in admin; the table is not in the database browser.

### Before the migration is applied

- The bookmark buttons are hidden, and so are the Saved pieces link in Shop This Look (web and app) and the Saved pieces row in her account area on the web.
- Two entries still show: **Saved pieces** in the web sidebar and the **Saved pieces** row in the app's account sheet. Tapping either opens the page described below.
- The page itself shows "Saved pieces are almost ready" on the web and "Saved pieces are almost here" in the app, and says saving is not switched on yet. Her looks and palettes are unaffected.

## Garment badges

Shop photos often show a whole outfit: a model in a shirt, trousers and a cap. The badge tells her which of those Mila is recommending.

What she sees:

- A solid pill in the **bottom-left corner** of the photo, with an icon **and** a word, for example "Trousers" or "Belt bag". Never an icon on its own.
- The text under the photo starts with the same word, for example "Trousers: Wool Skirt Trousers".
- Screen readers hear which piece Mila means: "... Mila is recommending the trousers" on the web and on most app screens. In the app's Dupe Hunter and feed garment sheet, the card is read as one link that starts with the caption, for example "Trousers: Wool Skirt Trousers".

### How the label is chosen

The same rules run on web and mobile. Both were checked against all 853 seeded catalogue products and agree on every one. The guiding rule: **a wrong label is worse than none**, so when the product name gives no confident answer, the badge shows the category's own word.

1. **The category decides the kind of piece.** A product in Bottoms is a bottom.
2. **Only the product name is read: the text before the first "|".** Catalogue titles look like "Name | Colour | Size", and a colour can itself be a garment word. "Baggy Chino | Trench Coat Khaki" is not a trench coat. A trailing "with ..." or "in ..." part is set aside too, so "Mod Coat with Liner Vest" is a coat.
3. **The last garment word in the name wins.** "Hat Bead Charm" is a charm. "Chino Short" is shorts. When two garment words end in the same place, the longer phrase wins: "Polo Shirt" is a polo, "Tote Bag" is a tote.
4. **The word must belong to the product's category.** If it doesn't, or the name has no garment word, the badge shows the **category word** instead ("Outerwear", "Accessory", "Dress"). A few words move a product to its real kind: a clutch, tote, backpack, belt bag or bag filed under Accessories is treated as a bag. Its badge says "Clutch", "Tote", "Backpack", "Belt bag" or "Bag", and on the Saved pieces page it sits with the bags.

Examples from the real catalogue:

| Product name | Category | Badge |
|---|---|---|
| Studio Kitten Heel Bootie | Shoes | Boots |
| Wool Skirt Trousers | Bottoms | Trousers |
| Nike Heritage Tote Bag (22L) | Bags | Tote |
| Baggy Chino \| Trench Coat Khaki \| 30L | Outerwear | Outerwear (see below) |
| Shoulder Belt for Bags | Bags | Bag |

### The six products filed under the wrong category

These catalogue rows, as seeded, sit in the wrong category, so their badge shows the wrong shelf's word. Check the Shop page for a row's current category before reporting it.

| Product | Filed under | It is really | Badge shows |
|---|---|---|---|
| Baggy Chino \| Trench Coat Khaki \| 30L | Outerwear | Bottoms | Outerwear |
| The Classic Shirt in Linen \| Trench Coat Khaki | Outerwear | Tops | Outerwear |
| The Cotton Honeycomb Square Crew \| Trench Coat Khaki | Outerwear | Tops | Outerwear |
| Nike Solo Fleece Men's Pullover Hoodie | Outerwear | Tops | Outerwear |
| The Retro Jersey Short \| Seafoam Tie Dye | Accessories | Bottoms | Accessory |
| Collegium x Everlane Moc Toe Derby \| Espresso Suede \| Women's | Accessories | Shoes | Accessory |

Where this shows up:

- In every badge for those products: Shop This Look, Dupe Hunter results, feed shops and Saved pieces.
- In the looks themselves: on days of 75 F or cooler a look can include a piece from the Outerwear shelf, and below 55 F Mila adds one if the look has none. So a member whose profile says Male (or gives no gender) can get the Baggy Chino as the **outerwear** piece, and a woman can get The Cotton Honeycomb Square Crew. The catalogue says they are outerwear, so the badge agrees with that wrong pick.
- In Dupe Hunter: a hunt only searches the shelf of the piece in her photo, so these products never come up when she hunts what they really are (the Baggy Chino never comes up for a trousers hunt).

One review also flagged "The Supima Boxer Brief \| Uniform \| Black", filed under Accessories, in place of the hoodie. Treat it as a seventh candidate.

The fix is a data change: correct the category of these rows in the catalogue. It is an owner-approved change, not a code change. Staff cannot change a category in admin, because the Shop page is read-only. It is listed as an open item in [Known issues and owner actions](/faqs/known-issues-and-owner-actions). When you spot one, send the owner the item title. Pieces a member saved before the fix keep the old badge on her Saved pieces page, because the saved copy is taken at the moment she saves. See [Shop and catalogue](/faqs/shop-catalogue).

> **Note:** Some products are honestly vague rather than wrong. Straps, bag organisers and pouches on the Bags shelf are badged "Bag", and a few brand-only names fall back to the category word. These are acceptable, not errors.

## What to tell the member

**"Where are my saved pieces?"**
"On the web, open Saved pieces in the menu (on a phone, it's in your account area). In the app, it's in your account menu, under Outfit archive."

**"I can't see a Save button."** (after the code is merged, before the migration)
"Saving pieces isn't switched on yet."

**"A saved piece says No longer available."**
"That product has been taken out of Mila's shop, so we can't link to it any more. We keep it on your list so you remember it. You can remove it whenever you like."

**"The label says Outerwear but it's trousers."**
"Thanks for spotting that. That product is filed under the wrong category in our shop. I've passed it on so it can be corrected."

## Related articles

- [Shop and catalogue](/faqs/shop-catalogue)
- [Dupe Hunter](/faqs/dupe-hunter)
- [Environments and releases](/faqs/environments-and-releases)
- [Known issues and owner actions](/faqs/known-issues-and-owner-actions)
