---
title: AI settings
category: AI features
summary: How to read the AI cost figures and switch the text and image models behind styling, with a warning that a change reaches every AI feature for every member.
tags: [ai, models, settings, tax, cost, openrouter, revenue, styling]
order: 30
updated: 2026-10-07
status: live
---

The AI Settings page controls which AI models power Mila's styling features, shows what the AI costs, and holds the tax figure used to report net revenue.

> **Important:** Changing a model here changes the AI for every member of every Mila app, within about 30 seconds, with no confirmation and no test. One wrong model can make looks, colour reads, Concierge and Dupe Hunter fail for everyone. Read this whole article before you press Save.

## Who can use it

Stewards only. Moderators do not see AI Settings.

## What the page shows

Three cards under a short note.

| Card | What it holds |
|---|---|
| Styling models | The text and vision model, the image model, and the buttons to save or restore them |
| Cost per call | Total cost per call, total AI spend, calls logged, and a table of spend by model, for the last 30 days |
| Revenue tax | The tax deducted from gross revenue to report net revenue on Analytics |

## Which features use which model

| Model | Used by |
|---|---|
| Text and vision model | Create my look (the review step and the plan step), Concierge chat, Dupe Hunter (reading the member's photo), garment detection in post photos, the colour read, outfit analysis in Lens, and the quality checks on photo previews and style sheets |
| Image model | The look picture, the style sheet and the photo preview |

So this one setting reaches almost every AI feature. The text model must understand images and return structured answers, because several of those features send photos and read back structured data. The image model must be able to produce images.

## One setting for everything

There is exactly one settings row for the whole Mila project. The live site and the nicoleDev preview read the same row. If you change a model on any admin address, live members get the change. See [Environments and releases](/faqs/environments-and-releases).

## Change the models

1. Open **AI Settings**. Look at the current choices and the **Cost per call** card first, so you know what normal looks like.
2. In **Styling models**, open the **Text & vision model** or **Image model** list. Each entry shows the model name and its id. Under the list a line describes the model.
3. To use a model that is not listed, choose **Custom model id** and type it in the form `vendor/model`, for example `anthropic/claude-opus-5.5`. The vendor is lowercase. The page refuses anything that does not have that shape.
4. Press **Save models**. It is greyed out until something has changed. You see "Styling models updated." and "Last changed" shows the time.
5. Wait about a minute. Each Mila server keeps the setting for 30 seconds, so for a moment some requests use the old model and some the new.
6. Create a look yourself, or ask someone to, and watch the **Cost per call** card over the next day.

The descriptions in the lists, including the prices, are written into the app by developers. Treat them as a guide. They can be out of date, and the models and prices come from the provider.

## Go back to the shipped models

Press **Restore the shipped models**. It is greyed out when you are already on them. It saves the two default models and shows "Back on the shipped models." Use it first if anything goes wrong.

| Setting | Shipped default |
|---|---|
| Text and vision | `deepseek/deepseek-v4.1-flash` |
| Image | `meta/muse-image` |

## What can go wrong

| Mistake | What members see |
|---|---|
| A model id the provider does not recognise (text) | When the provider answers with a clear "model not found" style error, the member app retries once on the shipped text model, so requests can still work, more slowly and with a logged error. Other kinds of failure are not retried. Fix the setting anyway |
| A model id the provider does not recognise (image) | There is no automatic retry. Look pictures, style sheets and photo previews fail until you restore the shipped models |
| A text model with no image support or no structured output | Photo-based features fail or return poor answers. Restore the shipped models |
| A much dearer model | Everything works but each call costs more. Compare the Cost per call card before and after |
| A very slow model | Looks take longer, and a member may leave the page before the result arrives |

For how a failed or abandoned generation is treated, see [Generations and tab switching](/faqs/generations-and-tab-switching), and for what happens to a member's credit when an AI call fails, see [Credits and refunds](/faqs/credits-and-refunds).

## The Cost per call card

It covers the last 30 days.

- **Total cost per call:** total AI spend divided by the number of calls that reported a cost. Calls with no reported cost are counted as calls but left out of this division.
- **Total AI spend** and **Calls logged**.
- A table of models with Calls, Tokens, Spend and Cost per call. The model currently in use for text or images carries an **Active** tag.
- If the log is bigger than one read can return, a line says the totals cover the newest calls only.

The Analytics page shows all-time totals for the same spend. They will not match this card, which covers 30 days only. See [Analytics and error reporting](/faqs/analytics-and-error-reporting).

## The Revenue tax card

This sets the tax that Analytics subtracts from gross revenue to show net revenue. It never changes what a member is charged.

1. Choose **Percentage of gross** or **Fixed amount**.
2. Enter the value. A percentage cannot go above 100, and a value cannot be negative.
3. The card shows the current setting and an example: what it would deduct from $1,000 of gross.
4. Press **Save tax setting**. You see "Revenue tax updated."

Net revenue never goes below zero, even with a large fixed amount. Revenue figures need Paddle, which is not live yet, so the tax has no visible effect until then. See [Subscriptions and plans](/faqs/subscriptions-and-plans).

## Undo and records

Both cards can be changed back by saving the old values, and the model card also has the restore button. Every save writes a line to the staff audit log with your account, which fields changed, and the old and new model ids. You can read it in Database, in the `staff_audit_log` table.

## Common questions

**Is there a safe way to try a model?** Not inside the app. There is no test mode, so the change is live for everyone the moment it is saved. If you must try one, do it at a quiet time and be ready to press Restore.

**Does a model change affect saved looks?** No. Saved looks stay as they were. Only new AI calls use the new model.

**Why is my new model missing from the usage table?** The table lists models that made at least one call in the last 30 days. A newly selected model appears after its first call. The Active tag marks a model that is currently selected.

**Do I need a developer to add a new model?** No, use the custom id box. The model must exist at the provider.

**Who decides which model to use?** That is the owner's decision. Ask before you change it.
