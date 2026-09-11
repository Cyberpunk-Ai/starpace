# Messaging polish, polls, payments and landing page

## 1. Messages: clean design and motion

- Rework the chat thread into calm, card-style bubbles: softer rounding, one accent side for you and a neutral surface for them, grouped consecutive messages from the same person with a single timestamp, and day separators.
- Images and videos in chat get their own clean media card (rounded, fixed aspect, tap to open full size) instead of raw inline media.
- Add gentle entry animation for new messages, smooth scroll-to-latest, a polished typing bubble, and quiet fade/slide transitions when switching chats.
- Conversation list: clearer unread badge, active-chat highlight, truncated preview, and a proper empty state.
- Attachment, voice note and reaction controls get consistent sizing and hover/press feedback; reaction chips animate on toggle.
- Respect the reduced-motion setting so animations turn off when the user asked for that.

## 2. Polls: real per-person voting

Current problem: the vote state (who voted, which option) is stored inside the post itself, so one person's vote shows up as everyone's vote, and counts can drift.

- Count votes from the vote records, not from the copy stored on the post.
- Each viewer sees their own vote only; someone who hasn't voted still sees open options.
- Block double voting server-side, keep the live update when someone else votes.

## 3. Reposts

- Verify the repost toggle persists both ways, that reposted items appear in the profile/feed as expected, and the count stays correct after reload.

## 4. Long content

- Confirm the "... Read more" behaviour on posts and apply the same clean treatment anywhere long text is cut off (comments, chat, space chat, bios).

## 5. Payments: real, clean and safe

- Remove the fake promo codes in the upgrade window (they only changed the displayed price, never the real charge).
- Make the upgrade flow honest end to end: clear price, redirect to the secure payment page, clear pending/success/failed states on return, and a real receipt list.
- Re-check that plan activation only happens after the payment provider confirms, on both the return page and the webhook, and that repeat confirmations can't double-apply.
- Check tipping and payouts follow the same rule.

## 6. Spaces

- Smooth the room: consistent controls, clearer speaker/listener states, animated hand-raise and speaking indicator, better mobile layout, and clean empty/loading states.

## 7. Landing page

- The email box currently just says "you're on the list" without saving anything. Either store real signups or replace it with a direct sign-up action.
- Finish incomplete sections, tighten spacing and motion, and make sure every link goes somewhere real.

## 8. Scale and gaps

- Add pagination/lazy loading where lists fetch everything at once, index the columns those queries filter on, and avoid per-item queries in loops.
- Sweep for any remaining sample or non-persistent data.

## Technical notes

- Poll counts derived from `poll_votes` with a per-viewer lookup during post hydration in `src/lib/api-client.ts`; the `poll` JSON keeps only question/options text.
- Chat redesign lives in `src/routes/messages.tsx` with Tailwind tokens from `src/styles.css`; no new colour literals.
- Promo logic removed from `src/components/social/UpgradeModal.tsx`; server price table in `src/lib/paystack.functions.ts` stays the single source of truth.
- Verification with typecheck, all routes, and an authenticated mobile/desktop pass.
