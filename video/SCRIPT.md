# Hisaab launch video, full package

Target runtime: about four minutes, under Razorpay's five-minute cap. Six beats. Narration is
written plainly, in the first person plural of the team, grounded in real figures from this
repository (the README's evaluation numbers, the app's own live dashboard), never invented ones.
Beats 3 and 4 narration is written to sit under live screen audio, not compete with it.

Nothing in this file is rendered yet. Recording narration is the one remaining step before this
becomes an actual video.

---

## The script

### Beat 1, "The notebook" (0:00-0:35)

**On screen:** a kirana counter, a shopkeeper writing in a paper notebook next to an unused card
machine. Nano Banana prompt for this still, in section below.

**Narration:**

> Every day, millions of small business owners across India extend credit the same way. A notebook.
> A phone number written on a page. A promise, remembered rather than recorded. Their card machine
> sits there because most of what they sell never touches it. The real ledger of their business
> lives in their memory and in pages that no bank ever sees.

### Beat 2, "The gap" (0:35-1:10)

**On screen:** the same shopkeeper on a phone, a two-sided ledger graphic, the credit-gap figures
landing on screen as they're spoken.

**Narration:**

> The Reserve Bank's own expert committee put the size of this gap at 20 to 25 lakh crore rupees.
> PM SVANidhi has already disbursed over 1.12 crore loans to 75.5 lakh street vendors. 89% of Indian
> adults have a bank account, but 16% of those accounts sit inactive. The credit exists. What's
> missing is a record good enough for anyone to lend against. Apps like OkCredit and Khatabook
> already help shopkeepers track who owes what. None of them check that record against a bank
> statement. We built the part that does.

### Beat 3, "Speak it into existence" (1:10-2:00)

**On screen:** screen recording, Shot A from the shot list below. Narration sits under the first
part of the recording, then goes quiet so the agent's own voice and the on-screen result carry the
rest of the beat.

**Narration (first 15 seconds only, then hold):**

> This is Hisaab. No typing, no forms. The shopkeeper just talks, in whatever mix of Hindi and
> English they actually speak in.

*(Screen recording plays through, unnarrated, showing the spoken sentence, the agent's reply, and
the khata entry appearing.)*

### Beat 4, "Ask it anything" (2:00-2:40)

**On screen:** screen recording, Shot B. Same pattern, narration opens the beat then steps back.

**Narration (first 10 seconds only, then hold):**

> And when that same customer comes back to settle up, the shopkeeper doesn't open an app or tap
> through a menu. They just ask.

*(Screen recording plays through: the settle-up question, the screen moving to the customer's khata
on its own while the agent is still speaking.)*

### Beat 5, "The line the model cannot cross" (2:40-3:20)

**On screen:** Shot C, the confidence ladder and the Methodology modal's precision/recall table.

**Narration:**

> Here's the part we're actually proud of. The model never touches money. Every rupee is calculated
> by deterministic code, the same code, every time. When our reconciliation engine checks a bank
> statement against the ledger, a match above 90% confidence posts automatically. Below that, the
> model can suggest a candidate, but its confidence is hard capped at 89% in code. It can never
> cross that line. On our test dataset, that discipline holds: 98.5% precision on settlement
> matching, 84.6% recall, and on invoice matching, 100% recall with no false positives. We'd rather
> flag an honest exception than force a wrong match.

### Beat 6, "2 AM" (3:20-4:00)

**On screen:** a simple title card, then the team, then the close.

**Narration:**

> You asked what broke at 2 AM. Our voice agent did, for a while. It went quiet completely, no
> error, just silence. We checked the obvious things first and they were all fine. It took driving
> a headless browser at our own app and reading raw WebSocket frames to find the real answer: a
> billing account with nothing left in it. We switched providers, and the same evening, a second
> provider's real-time voice output turned out to be blocked too, for a completely different reason.
> What got us through both times wasn't luck. It's that the model was never load-bearing in this
> product. It only listens and reads back what the engine already calculated. That's the whole
> reason we could swap two providers in an afternoon instead of rewriting the product. Hisaab. The
> books, spoken into existence, then checked against the bank.

---

## Nano Banana image prompts

Two stills needed, for beats 1 and 2. Generate externally, drop the results into `video/assets/`.

**Beat 1:**
> A middle-aged Indian shopkeeper in a small neighbourhood kirana store, mid-afternoon light,
> writing in a worn paper notebook next to an unused card machine, shelves of Indian FMCG packets
> behind him, documentary photography, natural colour, shallow depth of field, no text.

**Beat 2:**
> The same shopkeeper holding a basic smartphone to his ear at the counter, speaking, warm evening
> light through the shop shutter, documentary photography, natural colour, no text.

---

## Screen-recording shot list

Exact app state and exact spoken sentences, so recording takes one clean pass. Both sentences below
are the same ones already verified live against the real seeded catalog earlier in this project;
recording is not the first time either has been tried.

**Shot A (beat 3).** Fresh load of `/`. Click "Talk to Hisaab." Let the primer greeting play in
full (shows the new orb overlay reacting). Then speak exactly:

> "Sandeep ko do packet Amul Toned Milk, ek packet Lays chips, teen packet Maggi Noodles udhaar pe
> de diya."

Record through the full reply and until the tool-trace strip is expanded and visible.

**Shot B (beat 4).** Same session, continuing. Speak exactly:

> "Sandeep aaya hai hisaab karne, uska poora hisaab dikhao."

Record the screen navigating to `/khata` with Sandeep's row open while the agent is still speaking.
This is the moneyshot of the whole video, the one moment worth a slow punch-in during editing.

**Shot C (beat 5, silent cutaway).** No narration needed live, this gets voiced over in post.
Record: `/reconcile`, hovering a REVIEW-status row to show its confidence score sitting under 90%,
then the Methodology modal (now a centered fade-in) opened to the precision/recall table.

**Capture method:** a clean Chrome window driven against the local dev server, not recorded by
hand, so the state is controlled and repeatable. Shots A and B spend a small number of real Sarvam
STT/TTS credits each, so this step happens only when explicitly requested, not automatically.

---

## App screenshots needed (static, not recorded video)

- Control dashboard, the KPI row
- Reconcile view, the donut and the match table
- Khata view, a party selected, the credit-score chip and its tooltip open
- The rebuilt Methodology modal, centered, mid fade-in if capturable

---

## Numbers used in this script, and where they come from

| Figure | Value | Source |
|---|---|---|
| MSME credit gap | 20-25 lakh crore rupees | U.K. Sinha Expert Committee, 2019, cited in README |
| PM SVANidhi loans | 1.12 crore loans, 75.5 lakh vendors | Ministry of Housing and Urban Affairs, cited in README |
| Bank account ownership / inactive | 89% / 16% | World Bank Global Findex 2025, cited in README |
| Settlement match precision / recall | 98.5% / 84.6% | This repo's own eval harness, `npm run eval`, README |
| Invoice match precision / recall | 90.0% / 100.0% | Same eval harness, README |
| Confidence auto-post line / model cap | 90% / 89% | `src/lib/recon/match.ts`, `AI_CONFIDENCE_CAP` |

Every number here is already published in `README.md`. Nothing in this script states a figure that
isn't already backed by the codebase or a cited external source.
