#!/usr/bin/env python3
"""
A statement drawn the way the bank draws one — with numbers that are nobody's.

The bank sends a PDF once a month and offers no export, so the parser has to read a
page. A parser that reads a page cannot be trusted until it has read one, and the only
real statement available is a person's own. This is the way out: the layout, the column
headings, the number format and the page furniture are copied exactly from a screenshot
with every figure cropped out; the transactions are invented.

The two things it is faithful about are the two that break parsers. Amounts are written
`157,895.85` — comma for thousands, dot for the decimal, which is the English convention
on a Serbian bank's page. And the running balance in the last column is arithmetically
true down the whole document, across page breaks, because that chain is what the import
checks itself against.

  python3 scripts/fake-statement.py out.pdf
"""

import sys
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

W, H = landscape(A4)

# Column x positions, in the order and rough proportions the bank uses. Numeric columns
# are right-aligned to these; text columns are left-aligned.
COLS = {
    "received": 40,
    "executed": 130,
    "card": 215,
    "description": 285,
    "refAmount": 520,
    "origAmount": 600,
    "paidOut": 680,
    "paidIn": 740,
    "balance": 800,
}
RIGHT = {"refAmount", "origAmount", "paidOut", "paidIn", "balance"}

OPENING = 157895.85

# (day, description, out, in) — invented, but shaped like real ones: an ATM withdrawal,
# card payments, a standing order, an incoming transfer, and a foreign-currency charge.
TX = [
    ("01.08.2026", "SMART ATM - 200671, Kralja Petra 12", 26000.00, 0.00),
    ("03.08.2026", "MAXI 0231 BEOGRAD", 3412.55, 0.00),
    ("05.08.2026", "UPLATA PO FAKTURI 2026-118", 0.00, 84500.00),
    ("07.08.2026", "MTS DOO BEOGRAD - TRAJNI NALOG", 5599.00, 0.00),
    ("11.08.2026", "ANTHROPIC PBC SAN FRANCISCO", 10123.63, 0.00),
    ("14.08.2026", "IDEA 1123 SREMSKA MITROVICA", 1876.40, 0.00),
    ("18.08.2026", "NIS PETROL 0442", 6200.00, 0.00),
    ("21.08.2026", "APOTEKA JANKOVIC", 1340.00, 0.00),
    ("24.08.2026", "UPLATA PO FAKTURI 2026-119", 0.00, 42000.00),
    ("26.08.2026", "LIDL 0087 NOVI SAD", 4980.11, 0.00),
    ("28.08.2026", "EPS SNABDEVANJE - RACUN", 7890.00, 0.00),
    ("31.08.2026", "PROVIZIJA ZA ODRZAVANJE RACUNA", 320.00, 0.00),
]

ROWS_PER_PAGE = 4


def money(value: float) -> str:
    """`157,895.85` — the bank's own way of writing a number."""
    return f"{value:,.2f}"


def cell(c, column, y, text, bold=False):
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 7.5)
    x = COLS[column]
    if column in RIGHT:
        c.drawRightString(x, y, text)
    else:
        c.drawString(x, y, text)


def heading(c, page, pages):
    """The band every page repeats — page number, period, opening balance, columns."""
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(40, H - 40, f"Strana: {page}/{pages}")
    c.drawCentredString(W / 2, H - 40, "Od 01.08.2026  do 31.08.2026")
    c.drawRightString(700, H - 40, "Prethodno stanje:")
    c.drawRightString(COLS["balance"], H - 40, money(OPENING))

    y = H - 90
    cell(c, "received", y, "Datum prijema/", bold=True)
    cell(c, "received", y - 10, "Datum transakcije", bold=True)
    cell(c, "executed", y, "Datum", bold=True)
    cell(c, "executed", y - 10, "izvršenja", bold=True)
    cell(c, "card", y, "Broj kartice", bold=True)
    cell(c, "description", y, "Opis promene", bold=True)
    cell(c, "refAmount", y, "Iznos u", bold=True)
    cell(c, "refAmount", y - 10, "ref. valuti", bold=True)
    cell(c, "origAmount", y, "Iznos u orig.", bold=True)
    cell(c, "origAmount", y - 10, "valuti", bold=True)
    cell(c, "paidOut", y, "Isplata", bold=True)
    cell(c, "paidIn", y, "Uplata", bold=True)
    cell(c, "balance", y, "Stanje", bold=True)
    return y - 32


def build(path: str) -> float:
    pages = (len(TX) + ROWS_PER_PAGE - 1) // ROWS_PER_PAGE
    c = canvas.Canvas(path, pagesize=landscape(A4))

    running = OPENING
    y = heading(c, 1, pages)
    page = 1
    on_page = 0

    for date, desc, out, into in TX:
        if on_page == ROWS_PER_PAGE:
            c.showPage()
            page += 1
            y = heading(c, page, pages)
            on_page = 0

        running = running - out + into
        cell(c, "received", y, date)
        cell(c, "executed", y, date)
        cell(c, "description", y, desc)
        cell(c, "refAmount", y, "0.00")
        cell(c, "origAmount", y, "0.00")
        cell(c, "paidOut", y, money(out))
        cell(c, "paidIn", y, money(into))
        cell(c, "balance", y, money(running))
        y -= 18
        on_page += 1

    y -= 26
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, "STANJE")
    c.drawRightString(COLS["balance"], y, money(running))
    c.drawString(40, y - 18, "Nerealizovani čekovi: 0")

    c.save()
    return running


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "fake-statement.pdf"
    closing = build(out)
    print(f"{out}  opening={money(OPENING)}  closing={money(closing)}  rows={len(TX)}")
