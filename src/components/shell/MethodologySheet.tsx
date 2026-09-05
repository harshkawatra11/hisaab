// The honesty page. What the deterministic engine decides versus what
// the model merely proposes, the defect distribution in the synthetic
// dataset, and the known limitation (split payments) stated plainly
// rather than hidden. Opens as a sheet from the sidebar footer so it
// stays reachable without occupying a nav slot.

export function MethodologyContent() {
  return (
    <div className="mt-6 space-y-6 text-sm leading-relaxed pb-10">
      <section>
        <h3 className="font-heading font-semibold mb-2">What the engine decides, what the model proposes</h3>
        <p className="text-muted-foreground mb-3">
          The rule this product is built around: the model never computes money. It listens,
          structures speech into events, and explains results. A deterministic engine calculates
          every rupee, posts every ledger entry, and decides every reconciliation match.
        </p>
        <table className="w-full text-xs border border-border">
          <thead>
            <tr className="bg-muted">
              <th className="text-left p-2 border-b border-border">Concern</th>
              <th className="text-left p-2 border-b border-border">Decided by</th>
            </tr>
          </thead>
          <tbody className="tabular-figures">
            {[
              ["Money calculation and ledger posting", "Deterministic code, always"],
              ["Reconciliation match decision", "Deterministic code, always"],
              ["Match confidence above 90%, the auto-post line", "Deterministic code, the model cannot cross it"],
              ["Ambiguous counterparty reasoning (72-90% band)", "Model proposes, capped at 89%, never auto-posted"],
              ["GST and tax arithmetic", "Deterministic code, always"],
              ["Cash forecast", "Deterministic recurrence model, not an LLM"],
              ["Credit-risk score (0-100)", "A published formula, always. The model only reads the number back"],
              ["Speech understanding and explanation", "Model"],
            ].map(([concern, decider]) => (
              <tr key={concern} className="odd:bg-background even:bg-muted/40">
                <td className="p-2 border-b border-border align-top">{concern}</td>
                <td className="p-2 border-b border-border align-top">{decider}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">The reconciliation engine, three layers</h3>
        <p className="text-muted-foreground mb-3">
          Layer 1 matches on an exact reference and exact amount. Layer 2 scores every remaining
          candidate on four weighted signals and auto-posts anything above 90% confidence,
          flagging 72 to 90% for human review:
        </p>
        <div className="border border-border bg-muted p-3 font-mono text-xs mb-3">
          confidence = 0.40 &times; amount + 0.20 &times; date + 0.25 &times; name + 0.15 &times; reference
        </div>
        <p className="text-muted-foreground">
          Layer 3 only ever sees the candidates Layer 2 already produced, may only return an id
          from that list, and has its confidence clamped to a hard maximum of 0.89 in code. A
          model decision can never auto-post as matched, it always lands as a review row with its
          reasoning attached, for a human to accept.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">Credit-risk scoring, the formula</h3>
        <div className="border border-border bg-muted p-3 font-mono text-xs mb-3 whitespace-pre-wrap">
{`score = 100
      - (aging penalty     × 0.40)   share of open balance 30+ days late
      - (lateness penalty  × 0.35)   historical days-to-pay vs a 15-day term
      - (exception penalty × 0.15)   reconciliation exceptions on this party
      + (tenure bonus      × 0.10)   transaction count, so a new party isn't punished as hard`}
        </div>
        <p className="text-muted-foreground">
          Every input is a number the engine already computes for the Khata and reconciliation
          views, reused rather than re-derived. The score, and each component behind it, is shown
          on a tooltip on the Khata screen&apos;s score chip, never hidden behind just the number.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">Measured against ground truth</h3>
        <p className="text-muted-foreground mb-3">
          <code>npm run eval</code> runs the exact reconciliation pipeline the app uses against a
          deterministic, seeded 90-day synthetic dataset with documented defects and
          machine-readable ground truth, so the match rate means something rather than being
          self-graded:
        </p>
        <table className="w-full text-xs border border-border">
          <thead>
            <tr className="bg-muted">
              <th className="text-left p-2 border-b border-border">Loop</th>
              <th className="text-right p-2 border-b border-border">Match rate</th>
              <th className="text-right p-2 border-b border-border">Precision</th>
              <th className="text-right p-2 border-b border-border">Recall</th>
            </tr>
          </thead>
          <tbody className="tabular-figures">
            {[
              ["Settlement (bank/UPI)", "69.8%", "98.5%", "84.6%"],
              ["Invoice (tax-line)", "93.8%", "90.0%", "100.0%"],
            ].map((row) => (
              <tr key={row[0]} className="odd:bg-background even:bg-muted/40">
                <td className="p-2 border-b border-border align-top">{row[0]}</td>
                <td className="p-2 border-b border-border align-top text-right">{row[1]}</td>
                <td className="p-2 border-b border-border align-top text-right">{row[2]}</td>
                <td className="p-2 border-b border-border align-top text-right">{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted-foreground mt-3">
          84.6% recall on the settlement loop means roughly one in six genuine matches was missed,
          mostly by design: of the split-payment cases deliberately injected, the dedicated
          detector catches most and reports the remainder as a plain unmatched exception rather
          than a wrong match. That is a stated limitation, not a hidden one, published here because
          a system that only reports its successes is not trustworthy, and this one makes
          money-adjacent decisions.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">The synthetic dataset</h3>
        <p className="text-muted-foreground">
          Every transaction here is generated by a seeded, deterministic script
          (<code>SEED = 20260903</code>), documented in the repository, not real customer data. A
          fresh clone reproduces the identical dataset and the identical scores above. Defects are
          deliberately injected: exact matches, counterparty name variants, settlement lag of 1 to
          4 days, settlement fee deltas of 2 to 40 rupees, duplicate records, missing records,
          unrelated noise transactions, incorrect GST on invoices, and split-payment cases.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">Known limitation, stated honestly</h3>
        <p className="text-muted-foreground">
          The three-layer matcher performs one-to-one matching by design. A settlement paid in
          two separate transfers cannot be resolved as a single match. A dedicated detector
          catches most of these and raises an honest split-payment exception rather than a wrong
          match or a silent miss, but this remains a stated limitation, not a solved problem.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">Voice, and how a turn actually works</h3>
        <p className="text-muted-foreground">
          Voice is a listen, think, speak loop across two independently verified providers,
          Sarvam for speech in and speech out, Gemini for text reasoning and tool calls, not a
          single live audio socket. A turn moves through four visible stages, listening,
          transcribing, thinking, speaking, shown next to the voice button so a wait is always
          labelled rather than silent. Reasoning tries <code>gemini-3.6-flash</code> first, falls
          back to <code>gemini-3.7-flash</code> on a failure or an empty response, and only as a
          last resort falls through once more to a free OpenRouter model. Speaking over the agent
          stops playback immediately and opens a new turn.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">What broke building this, and how we found it</h3>
        <p className="text-muted-foreground">
          The voice agent went completely silent partway through this build, with no error shown
          anywhere. Two early guesses about why were wrong. The real answer only surfaced by
          driving a headless browser at the running app and reading raw WebSocket frames, and then
          by connecting to the provider directly from Node, outside every SDK, to read the literal
          close reason a wrapped client had been hiding: a billing account with nothing left in
          it. A second key told a different story again, real-time audio blocked by a plan-level
          restriction, reproduced twice. Both times, the reason the product kept working is the
          same rule stated at the top of this page: the model was never allowed to touch money, so
          swapping the provider behind it cost an afternoon, not a rewrite. The full account, in
          the order it actually happened, is in the repository&apos;s README under
          &quot;What broke at 2 AM.&quot;
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">What is simulated, what is real</h3>
        <p className="text-muted-foreground">
          No live UPI rails, no NPCI membership, no Account Aggregator access, no bank core write
          access. Only a regulated entity can transact on those rails. This demo simulates
          the reconciliation loop against documented synthetic bank, UPI and invoice data. Not an
          accounting system of record and not tax advice.
        </p>
      </section>

      <section>
        <h3 className="font-heading font-semibold mb-2">Sign-in</h3>
        <p className="text-muted-foreground">
          This build runs as a single demo merchant with no login. The store layer already
          takes and checks an owner id on every read and write, so real authentication is a
          change to one function rather than a change to every call site later.
        </p>
      </section>
    </div>
  );
}
