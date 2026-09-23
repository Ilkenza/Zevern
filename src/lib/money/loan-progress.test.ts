import { describe, expect, it } from "vitest";
import { loanClosure, settledOf, weighLoanMove } from "./loan-progress";

/*
  A debt is the one figure in this app that is worked out from the ledger every time it
  is read, and the reason it can be is this table. Everything below is asserted rather
  than described, because "you cannot be told a debt is paid when it is not" is a
  promise, and the way a promise survives is that something checks it.
*/
describe("weighLoanMove", () => {
  it("does not count the movement that opened the debt", () => {
    // The total is stated on the debt. The entry that started it moved real money and
    // belongs in the balance — it just says nothing about how much has been repaid.
    expect(weighLoanMove("borrowed", "loan_in")).toBe(0);
    expect(weighLoanMove("lent", "loan_out")).toBe(0);
  });

  it("counts a repayment on a debt you owe", () => {
    expect(weighLoanMove("borrowed", "loan_out")).toBe(1);
    // An instalment stays an ordinary expense so budgets see it — and still pays the
    // debt down, which is the whole reason `loan_id` survives on an expense.
    expect(weighLoanMove("borrowed", "expense")).toBe(1);
  });

  it("counts a repayment on a debt owed to you", () => {
    expect(weighLoanMove("lent", "loan_in")).toBe(1);
    expect(weighLoanMove("lent", "income")).toBe(1);
  });

  it("takes a refund back off, both ways round", () => {
    /*
      The gap this file was written to close. A bank refunding an instalment used to be
      lumped in with the opening movement and ignored: the money was back on the account
      and the debt still claimed it had been paid.
    */
    expect(weighLoanMove("borrowed", "income")).toBe(-1);
    expect(weighLoanMove("lent", "expense")).toBe(-1);
  });
});

describe("settledOf", () => {
  const RATE = 30776.48;

  it("walks a credit down to nothing", () => {
    const moves = [
      { kind: "loan_in", amount: 123105.92 }, // the money arriving — not a repayment
      { kind: "expense", amount: RATE },
      { kind: "expense", amount: RATE },
      { kind: "expense", amount: RATE },
      { kind: "expense", amount: RATE },
    ];
    expect(settledOf("borrowed", moves)).toBeCloseTo(123105.92, 2);
  });

  it("puts a refunded instalment back on the debt", () => {
    const paid = [{ kind: "expense", amount: RATE }, { kind: "expense", amount: RATE }];
    expect(settledOf("borrowed", paid)).toBeCloseTo(RATE * 2, 2);
    expect(settledOf("borrowed", [...paid, { kind: "income", amount: RATE }])).toBeCloseTo(RATE, 2);
  });

  it("never reports a debt as owing more than it is", () => {
    // A refund larger than everything ever paid is a bookkeeping mistake, not money
    // owed back — nought is the floor, so `outstanding` can never exceed the total.
    expect(settledOf("borrowed", [{ kind: "income", amount: 50000 }])).toBe(0);
    expect(
      settledOf("borrowed", [
        { kind: "expense", amount: 1000 },
        { kind: "income", amount: 9000 },
      ]),
    ).toBe(0);
  });

  it("counts nothing on a debt with only its opening entry", () => {
    expect(settledOf("borrowed", [{ kind: "loan_in", amount: 5000 }])).toBe(0);
    expect(settledOf("lent", [{ kind: "loan_out", amount: 5000 }])).toBe(0);
  });

  it("reads a debt owed to you the other way round", () => {
    const moves = [
      { kind: "loan_out", amount: 5000 }, // handed over — opens it
      { kind: "loan_in", amount: 2000 }, // they paid some back
      { kind: "expense", amount: 500 }, // you lent them a bit more
    ];
    expect(settledOf("lent", moves)).toBe(1500);
  });

  it("ignores a kind that means nothing to a debt", () => {
    // `transfer` and `saving` never carry a loan_id, but a stray one must not move a
    // figure it has nothing to do with.
    expect(settledOf("borrowed", [{ kind: "expense", amount: 1000 }, { kind: "saving", amount: 999 }]))
      .toBe(1000);
  });
});

describe("loanClosure", () => {
  it("closes a debt the moment the ledger says nothing is left", () => {
    expect(loanClosure({ before: 3000, after: 0, settled: false })).toBe("close");
  });

  it("says nothing about a debt already closed", () => {
    expect(loanClosure({ before: 0, after: 0, settled: true })).toBe(null);
  });

  it("leaves a debt with money on it open", () => {
    expect(loanClosure({ before: 3000, after: 1000, settled: false })).toBe(null);
  });

  /*
    The payment that closed it has gone — by a delete, or by an edit down — so the reason
    the debt was closed went with it.
  */
  it("reopens one that was standing at nothing and no longer is", () => {
    expect(loanClosure({ before: 0, after: 2700, settled: true })).toBe("reopen");
  });

  /*
    The other way a debt closes: somebody forgave what was left. It was never at nought,
    so nothing here may touch it — otherwise the forgiveness comes undone the next time
    any entry against that debt is edited.
  */
  it("never reopens a debt that was closed with a balance still on it", () => {
    expect(loanClosure({ before: 4000, after: 6000, settled: true })).toBe(null);
  });

  /* Rounding leaves tenths of a dinar behind; they are not a debt. */
  it("counts a hundredth of a dinar as paid", () => {
    expect(loanClosure({ before: 100, after: 0.004, settled: false })).toBe("close");
  });
});

/*
  An instalment that came back.

  Rare and real: a bank reverses a charge, a shop cancels the thing the credit was taken
  for. It is the movement `income` against a debt has always been, and now has a word —
  so both have to weigh the same, or a debt would quietly go on saying it had been paid.
*/
describe("a refund against a debt", () => {
  it("takes a repayment back off a debt you owe", () => {
    expect(weighLoanMove("borrowed", "refund")).toBe(-1);
    expect(weighLoanMove("borrowed", "income")).toBe(-1);
  });

  it("takes money back off a debt somebody owes you", () => {
    expect(weighLoanMove("lent", "refund")).toBe(1);
  });

  it("never drives what has been settled below nothing", () => {
    expect(
      settledOf("borrowed", [
        { kind: "expense", amount: 1000 },
        { kind: "refund", amount: 4000 },
      ]),
    ).toBe(0);
  });
});
