---
title: Shop catalogue
category: Shop & catalogue
summary: What the Shop page shows, what each product field means, and how those fields decide what members see in Shop This Look and Dupe Hunter.
tags: [shop, catalogue, products, category, gender, attire, stock, affiliate, region, price]
order: 10
updated: 2026-10-07
status: live
---

The Shop page is the staff view of the product catalogue. Every product a member can be sent to, in Shop This Look and in Dupe Hunter, comes from this list.

## Who can use it

Stewards only. Moderators do not see Shop.

> **Important:** The Shop page is read-only. You can search, filter, open an item, copy its links and export a spreadsheet. You cannot edit a product, change its category or mark it out of stock here. Changes to the catalogue are made in the database by the owner. If you find a problem, send the owner the item title and what is wrong. The copy-link buttons in the item window make that easy.

## What the page shows

A short note, then filters, then a table with 50 items per page, newest first.

| Filter | What it does |
|---|---|
| Search | Looks in title, description and category. Commas, round brackets, double quotes, backslashes and stars are replaced with spaces before the search runs |
| Category | One category from the catalogue itself |
| Attire | Items that carry the chosen attire register |
| Brand | One brand |
| Gender | Male, Female or Unisex |
| Stock | Any stock, In stock only, Out of stock only |

**Clear** appears when any filter is on. **Refresh** reloads. The bottom shows "N total" (or "N matching") and the page number.

The Category, Attire and Gender lists are built from up to 1,000 products, so a value used only by other products might not appear. The Brand list shows every brand.

| Column | What it shows |
|---|---|
| Item | Picture, title and brand |
| Category | Category and gender |
| Price | Price in the item's own currency, with the original struck through when discounted |
| Links | The product link and the brand site, each opening in a new tab |
| Status | In stock or Out of stock, a Verified tag, and a discount tag |
| Added | The date the item was added |

Press **View** to open an item. The window shows the picture, price, category, gender and status, then:

- **Links:** the product link, brand site and image link, each with a copy button and an Open button.
- **Item:** category, gender, price and discount, rating, units sold, shipping note, verification status, when it was last verified, regions, body shapes, seasonal palettes and attire.
- **Brand:** name, status, verified seller, affiliate network and commission.
- **Description:** the shop's own words.

### Export CSV

**Export CSV** writes every item that matches your filters (up to 2,000), with its main fields and every link, to a spreadsheet file. The description, brand status and verified seller flag are not included. If the catalogue is larger than the cap, a message tells you the export covers only the first items. The file contains no member data, but it is Mila's commercial catalogue, so keep it inside the team.

## The product fields, and what they do

| Field | Values | Effect on members |
|---|---|---|
| Category | Tops, Bottoms, Dresses, Outerwear, Shoes, Bags, Jewelry, Accessories | Groups the product. Shop This Look picks pieces category by category. Dupe Hunter only compares a photo with products in the same category. It also decides the badge word, see below |
| Gender | Male, Female, Unisex | Shop This Look shows Unisex items plus the member's own gender. If Mila does not know the member's gender, one direction is chosen per look so menswear and womenswear never mix in one look |
| Attire | Business Professional, Business Casual, Smart Casual, Casual, Athletic, Evening, Formal (an item can have several, or none) | The look is built for an occasion, and the AI is shown each item's attire so it can match the occasion. An item with no attire is not blocked, its register is just unknown |
| In stock | Yes or No | An out-of-stock item is never offered in Shop This Look or Dupe Hunter |
| Verification status | verified, unverified, broken | A broken item is never offered. A verified item with a check date shows "Last checked" and the date on the Shop This Look card. Anything else shows "Link not yet verified" |
| Affiliate link | A web address | The whole Shop This Look card links here, and so does its Shop button. Dupe Hunter results link here. An item with no link is skipped by Dupe Hunter |
| Regions | Country codes. Empty means ships everywhere | If the member's country is known, products that do not ship there are left out. If it is unknown, nothing is filtered out |
| Price and currency | A number and a currency | Shown on the card. In Dupe Hunter, a member's own price ceiling hides anything dearer |
| Palettes and body shapes | Lists | A match ranks a product higher. An untagged product can still be chosen |
| Image | A web address | A missing image shows "Image not available" on the card |

### Shop This Look in one paragraph

When a member creates a look, Mila loads every product in each category that is in stock, not broken, ships to the member's region and fits their gender. It ranks tagged ones first, then gives the AI the list with titles, prices and attire. The AI chooses the pieces, and a few similar items are added beside them. In hot weather, above 75 degrees Fahrenheit, Outerwear is left out of looks entirely. So a wrong field does not break the page, it quietly changes which products are even considered.

### Dupe Hunter in one paragraph

Dupe Hunter reads the member's photo and looks at products in the same category that are in stock, not broken and have a link. Live today it ranks all of them within the member's region and price ceiling and shows the top ones. After the nicoleDev release it keeps only products that look close enough, then applies region and price ceiling. For the full method see [Dupe Hunter](/faqs/dupe-hunter).

| | Fields Dupe Hunter reads |
|---|---|
| Live today | Category, in stock, verification (broken is skipped), link, region and price. Title, description and palettes only change the ranking |
| After the nicoleDev release | The same, plus gender and attire. Title and description can now also rule a product out as a different kind of garment |

## The badge word on a product

Live today, a recommended product shows its category and its full title, with no garment label. After the nicoleDev release, each recommended product carries a small label saying which garment it is, for example "Coat" or "Jeans". The label is decided from the product's **category first**, then its name. The category sets the shelf, and the name can only make the label more exact on that shelf.

> **Important:** The badge never guesses across shelves. A skirt filed under Tops shows the word "Top", not "Skirt". A coat filed under Accessories shows "Accessory". A miscategorised product therefore shows the wrong word, and it is also treated as the wrong kind of piece when looks are built and when Dupe Hunter compares products. Fix the category, not the badge. For how the badge works see [Saved pieces and garment badges](/faqs/saved-pieces-and-garment-badges).

A review found a few catalogue rows filed under the wrong category. That is a data fix for the owner. See [Known issues and owner actions](/faqs/known-issues-and-owner-actions) for open data fixes. When you spot one, send the owner the item title and the category it should have.

## Common questions

**Can I mark an item out of stock?** Not here. Send the owner the title.

**A member says a Shop button leads to a missing page.** Open the item, press **Open** on the product link to check, and tell the owner. A broken link should be marked broken or out of stock in the database.

**Why is an item missing from a member's look?** It may be out of stock, broken, not shipping to their country, filed under another gender, outerwear on a hot day, or just not chosen. Open the item and check those fields.

**What does Verified mean?** The status field says "verified". It does not promise the item is still in stock, only that its link was checked on the date shown.

**Does exporting change anything?** No. It only downloads a file.
