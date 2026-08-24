import Link from "next/link";
import {
  Send,
  FileSpreadsheet,
  FolderKanban,
  ReceiptText,
  Users,
  ListChecks,
  Sparkles,
  Wrench,
  Wallet,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/* ------------------------------------------------------------------ pieces */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-[11px] uppercase tracking-[0.14em] text-gold/85">
      {children}
    </div>
  );
}

/** A numbered link in the lead → quote → project → invoice chain. */
function ChainStep({
  step,
  icon: Icon,
  title,
  lede,
  detail,
}: {
  step: string;
  icon: LucideIcon;
  title: string;
  lede: string;
  detail: string;
}) {
  return (
    <li className="bg-surface px-5 py-6 sm:px-6 sm:py-7">
      <div className="flex items-center gap-2.5">
        <span className="mono text-[12px] font-semibold tracking-[0.1em] text-gold">
          {step}
        </span>
        <Icon aria-hidden className="h-4 w-4 text-faint" />
      </div>
      <h3 className="mt-3 font-display text-[19px] font-extrabold tracking-[-0.4px] text-ink">
        {title}
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{lede}</p>
      <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] leading-relaxed text-muted">
        {detail}
      </p>
    </li>
  );
}

/** One concrete fact about a capability group: a short label and a real sentence. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="border-t border-line-soft py-4 first:border-t-0 first:pt-0">
      <div className="mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
        {label}
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{children}</p>
    </li>
  );
}

function Capability({
  icon: Icon,
  eyebrow,
  title,
  lede,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line-soft py-12 sm:py-16">
      <div className="mx-auto grid max-w-260 gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <div className="flex items-center gap-2.5">
            <Icon aria-hidden className="h-4 w-4 text-gold" />
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
          <h2 className="mt-3 font-display text-[24px] font-extrabold leading-[1.15] tracking-[-0.7px] text-ink sm:text-[28px]">
            {title}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">{lede}</p>
        </div>
        <ul className="min-w-0">{children}</ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- page */

export function Landing() {
  return (
    <div className="min-h-screen bg-base text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-ctrl focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>

      {/* ------------------------------------------------------------ header */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-260 items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <span className="font-display text-[18px] font-extrabold tracking-[-0.5px] text-ink">
            Zevern
          </span>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-ctrl px-2 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Link href="/login" className={buttonClasses("primary")}>
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ---------------------------------------------------------- hero */}
        <section className="border-b border-line-soft">
          <div className="mx-auto max-w-260 px-5 py-16 sm:px-8 sm:py-24 lg:py-28">
            <div className="max-w-[46rem]">
              <Eyebrow>{"// one workspace, one person"}</Eyebrow>
              <h1 className="mt-4 font-display text-[34px] font-extrabold leading-[1.05] tracking-[-1.2px] text-ink sm:text-[46px] sm:tracking-[-1.8px] lg:text-[56px]">
                Everything between finding a client and getting paid, in one
                place.
              </h1>
              <p className="mt-6 max-w-[38rem] text-[15px] leading-relaxed text-muted sm:text-[16.5px]">
                Zevern is a workspace for a freelance web designer or developer
                working alone. Leads, quotes, projects, invoices, clients,
                tasks, an SEO check and your toolbox — plus a private side for
                your own money, kept away from the business.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className={buttonClasses("primary", "px-5 py-2.5 text-[14px]")}
                >
                  Start free
                </Link>
                <Link
                  href="/login"
                  className={buttonClasses(
                    "secondary",
                    "border px-5 py-2.5 text-[14px]",
                  )}
                >
                  I already have an account
                </Link>
              </div>

              <p className="mt-5 max-w-[34rem] text-[12.5px] leading-relaxed text-muted">
                An email and a password is the whole sign-up. There is no
                billing in Zevern yet — nothing to pay, nothing to cancel.
              </p>
            </div>

            <div className="mono mt-12 flex flex-wrap gap-x-3 gap-y-2 border-t border-line-soft pt-6 text-[10.5px] uppercase tracking-[0.12em] text-muted sm:mt-16">
              <span>Leads</span>
              <span aria-hidden>·</span>
              <span>Quotes</span>
              <span aria-hidden>·</span>
              <span>Projects</span>
              <span aria-hidden>·</span>
              <span>Tasks</span>
              <span aria-hidden>·</span>
              <span>Clients</span>
              <span aria-hidden>·</span>
              <span>Invoices</span>
              <span aria-hidden>·</span>
              <span>SEO / GEO</span>
              <span aria-hidden>·</span>
              <span>Toolbox</span>
              <span aria-hidden>·</span>
              <span className="text-gold/85">Private</span>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- chain */}
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-260 px-5 sm:px-8">
            <div className="max-w-[36rem]">
              <Eyebrow>{"// the spine"}</Eyebrow>
              <h2 className="mt-3 font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.8px] text-ink sm:text-[32px]">
                The same four moves, every week.
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Zevern is built around the run you already do by hand. Each step
                hands its work to the next one, so nothing gets typed twice.
              </p>
            </div>

            <ol className="mt-8 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              <ChainStep
                step="01"
                icon={Send}
                title="Lead"
                lede="Someone whose site you would like to rebuild. Save them with a channel, a service, a value and a date to come back to."
                detail="Eleven statuses, from New through Negotiating and “Awaiting their site” to Won. A follow-up that is due today or already late shows up on your overview."
              />
              <ChainStep
                step="02"
                icon={FileSpreadsheet}
                title="Quote"
                lede="Pick lines from your feature catalog, set quantities, choose the currency. The total adds up as you build it."
                detail="One catalog item holds a EUR, a USD and a RSD price, so switching the quote’s currency picks the right one instead of asking you to convert."
              />
              <ChainStep
                step="03"
                icon={FolderKanban}
                title="Project"
                lede="A won lead becomes a client and a draft project in one click, carrying the contact and notes across."
                detail="Projects hold status, value and a due date. Tasks hang off them with a priority, and today’s tasks sit on the overview."
              />
              <ChainStep
                step="04"
                icon={ReceiptText}
                title="Invoice"
                lede="An accepted quote turns into a draft invoice — same lines, same currency, same total, nothing retyped."
                detail="The quote is marked accepted and linked to the invoice, so the two never drift apart. Both have a printable page."
              />
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------- capabilities */}
        <Capability
          icon={Send}
          eyebrow={"// leads"}
          title="Leads that arrive already filled in."
          lede="The slow part of prospecting is copying a name, a handle and a phone number out of a browser tab. Zevern reads them for you."
        >
          <Fact label="Chrome extension">
            Open an Instagram profile, a Facebook page, a Google Maps business
            or a reply in Gmail or Proton Mail, click the extension, and the
            lead is saved straight to your account with its name, handle or
            phone, and channel already set.
          </Fact>
          <Fact label="Duplicate check">
            Before you save, the extension tells you whether that person is
            already in your leads — so a profile you looked at last month does
            not become a second row.
          </Fact>
          <Fact label="Connected once">
            You generate a token in Settings and paste it into the extension.
            Only its hash is stored, and generating a new one revokes the old
            one instantly.
          </Fact>
          <Fact label="CSV import">
            Paste or upload a CSV or TSV and Zevern shows the plan first: which
            rows are new, which existing leads would change, and field by field
            what the old and new values are. Nothing is written until you say
            so. Your leads export back out as CSV too.
          </Fact>
          <Fact label="Templates">
            Write an outreach message once with placeholders like{" "}
            <code className="mono text-ink">{"{name}"}</code> and{" "}
            <code className="mono text-ink">{"{company}"}</code>. Open a lead,
            pick the template, and it comes out filled in and ready to copy.
          </Fact>
        </Capability>

        <Capability
          icon={FileSpreadsheet}
          eyebrow={"// quotes and invoices"}
          title="A quote becomes an invoice, not a retyping job."
          lede="The money side is where duplicated work turns into wrong numbers. Every figure here is entered once."
        >
          <Fact label="One button">
            Converting a quote creates a draft invoice with the quote’s line
            items, currency and total, gives it the next number, marks the quote
            accepted and links the two together.
          </Fact>
          <Fact label="Numbering">
            Invoice numbers run YYYY-NNN and come from the highest number
            actually used this year, not from a row count — delete an invoice
            and its number is still never reissued to someone else.
          </Fact>
          <Fact label="Overdue is derived">
            A sent invoice whose due date has passed shows as overdue on its
            own. You do not have to remember to change a status.
          </Fact>
          <Fact label="Printable">
            Quotes and invoices each have a clean print page carrying your
            business name, address, email and VAT / PIB from Settings — print it
            or save it as a PDF from the browser.
          </Fact>
          <Fact label="Feature catalog">
            Keep the things you sell — a page, a shop, a redesign — with a price
            in all three currencies, and build quotes out of them instead of
            starting from an empty document.
          </Fact>
        </Capability>

        <Capability
          icon={Users}
          eyebrow={"// clients, projects, tasks"}
          title="The record of who, what and when."
          lede="Small, plain lists that answer the questions you actually ask yourself on a Monday morning."
        >
          <Fact label="Clients">
            A client carries their region — domestic in dinars, or international
            in euros and dollars — a tier that reminds you of your usual price
            range for that kind of job, and the number of projects you have run
            for them.
          </Fact>
          <Fact label="Projects">
            Status from draft through pending and in progress to delivered,
            with a value and a due date.
          </Fact>
          <Fact label="Tasks">
            A priority, a due date, and a checkbox. Anything due today or
            overdue is counted on the overview.
          </Fact>
          <Fact label="Overview">
            Active projects, revenue paid this month, what is still outstanding
            and how many invoices are overdue, plus today’s tasks, leads waiting
            on a follow-up, a monthly revenue goal and a feed of what you last
            touched.
          </Fact>
        </Capability>

        <Capability
          icon={Sparkles}
          eyebrow={"// seo / geo"}
          title="Check a page before you hand it over."
          lede="Paste a URL. Zevern fetches the page on the server and reads the markup that search engines and AI answers rely on."
        >
          <Fact label="Eleven checks">
            Title length, meta description, a single H1, H2 structure, word
            count, canonical link, mobile viewport, the HTML lang attribute and
            how many images carry alt text — plus the two that matter for AI
            answers: JSON-LD structured data and Open Graph tags.
          </Fact>
          <Fact label="A score, not a verdict">
            Each check passes, warns or fails, and the page gets a 0–100 score
            out of them — good, fair or poor at a glance.
          </Fact>
          <Fact label="It explains itself">
            Every finding says why that thing matters and shows a correct
            example of the tag, so a warning is something you can fix rather
            than something you have to look up.
          </Fact>
          <Fact label="Kept">
            Checks are saved with the URL, the page title, the score and when
            you ran them, and can be attached to a project — so a re-run sits
            next to the last one.
          </Fact>
        </Capability>

        <Capability
          icon={SlidersHorizontal}
          eyebrow={"// settings"}
          title="Only as big as you need it to be."
          lede="Most tools for freelancers are a team product with the team removed. Zevern lets you delete the parts you do not use."
        >
          <Fact label="Eight switches">
            Leads, Projects, Tasks, Clients, Invoices, Quotes, SEO / GEO and
            Toolbox each turn on or off in Settings. Switched off, a module
            disappears from the sidebar and from the “+ New” menu. Overview and
            Settings always stay.
          </Fact>
          <Fact label="Toolbox">
            <Wrench aria-hidden className="mr-1.5 inline h-3.5 w-3.5 text-faint" />
            The hosting, database, design and mail services you build with, kept
            in one list grouped by category, so a client asking “where is my
            site hosted?” takes ten seconds to answer.
          </Fact>
          <Fact label="Yours only">
            Every row is tied to your account. Zevern has no team, no seats and
            no shared workspace — it is a single-person tool on purpose.
          </Fact>
        </Capability>

        {/* ------------------------------------------------------- private */}
        <section className="border-t border-line bg-deep py-14 sm:py-20">
          <div className="mx-auto max-w-260 px-5 sm:px-8">
            <div className="max-w-[40rem]">
              <div className="flex items-center gap-2.5">
                <Wallet aria-hidden className="h-4 w-4 text-gold" />
                <Eyebrow>{"// and also"}</Eyebrow>
              </div>
              <h2 className="mt-3 font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.8px] text-ink sm:text-[32px]">
                The other half of the month: your own money.
              </h2>
              <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
                Freelancing does not stop at the invoice. Zevern has a second
                workspace, with its own sidebar, for the personal side — rent,
                the phone you are paying off, what you are saving for. Switch to
                it when you need it and it is not in the way the rest of the
                time.
              </p>
            </div>

            <div className="mt-10 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Budgets that know the date",
                  body: "A monthly limit per category, with the bar measured against how far into the month you actually are — green while you are on pace, gold when you are ahead of it, red once you are over.",
                },
                {
                  title: "Recurring, including instalments",
                  body: "Bills that repeat weekly, monthly or yearly, and things paid off in a fixed number of instalments — four months of a phone counts down 1/4, 2/4, and stops itself when it is settled.",
                },
                {
                  title: "Ninety days ahead",
                  body: "Every recurring item due in the next 30, 60 and 90 days, walked date by date against your balances — and if the running balance goes under, the exact day it happens.",
                },
                {
                  title: "Goals you put money into",
                  body: "Name what you are saving for, then move an amount aside against it. What is put aside is counted from the entries themselves, not typed in twice.",
                },
                {
                  title: "Three currencies, one total",
                  body: "Enter an amount in dinars, euros or dollars. Everything is totalled in dinars, and the rate used is stored on the entry itself — so last month’s numbers stay where they were when today’s rate moves.",
                },
                {
                  title: "Rates you do not type",
                  body: "Pull the National Bank of Serbia’s published middle rate for EUR and USD in one click, or set both by hand. Either way, past entries keep the rate they were saved with.",
                },
              ].map((c) => (
                <div key={c.title} className="bg-surface px-5 py-6 sm:px-6">
                  <h3 className="font-display text-[16.5px] font-bold tracking-[-0.3px] text-ink">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>

            <p className="mono mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted">
              <ListChecks aria-hidden className="h-3.5 w-3.5" />
              <span>Private tasks</span>
              <span aria-hidden>·</span>
              <span>Money</span>
              <span aria-hidden>·</span>
              <span>Budgets</span>
              <span aria-hidden>·</span>
              <span>Recurring</span>
              <span aria-hidden>·</span>
              <span>Forecast</span>
              <span aria-hidden>·</span>
              <span>Goals</span>
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------- closing cta */}
        <section className="border-t border-line-soft py-16 sm:py-24">
          <div className="mx-auto max-w-260 px-5 sm:px-8">
            <div className="max-w-[38rem]">
              <Eyebrow>{"// start"}</Eyebrow>
              <h2 className="mt-3 font-display text-[28px] font-extrabold leading-[1.1] tracking-[-1px] text-ink sm:text-[36px]">
                Start with the next lead.
              </h2>
              <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
                Zevern is new and it is built for one person doing all of it.
                Sign up, switch off the modules you do not want, and put the
                next lead in — you will know within a week whether the chain
                fits how you work.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className={buttonClasses("primary", "px-5 py-2.5 text-[14px]")}
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="rounded-ctrl px-2 py-2 text-[13.5px] font-semibold text-gold-hi transition-colors hover:text-gold"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
                Free while it is being built. If that ever changes, it will not
                change quietly.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-260 flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <span className="font-display text-[14px] font-extrabold tracking-[-0.3px] text-ink">
            Zevern
          </span>
          <span className="mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            A workspace for one freelancer
          </span>
          <Link
            href="/login"
            className="rounded-ctrl text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
