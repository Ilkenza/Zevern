import { describe, expect, it } from "vitest";
import { journalItems, readReceipt, receiptDay, receiptToken, receiptUrl } from "./receipt";

/*
  Three real receipts, fetched from the tax service while this parser was being written,
  with everything a printer actually does to a receipt: a company name that runs over two
  lines, an address that runs over three, a tax mark that is not the usual one, units in
  brackets, and a product name that ends in `24/KOM` — which looks exactly like a unit and
  is part of what the shop is selling.
*/

const PLEASURE_PARK = {
  invoiceRequest: {"posTime": null, "taxId": "112392483", "businessName": "RESTAURANT PLEASURE PARK ČAIR", "locationName": "1207756-PLEASURE PARK ČAIR", "address": "ИX БРИГАДЕ 27 Л1   ", "city": "НИШ (МЕДИЈАНА)", "administrativeUnit": "Ниш-Медијана", "buyer": null, "buyerCostCenter": null, "cashier": "Operater 1", "requestedBy": "VBMHX9SX", "referentDocumentNumber": null, "invoiceType": 0, "transactionType": 0, "payments": [{"paymentType": 1, "amount": 1500.0}]},
  invoiceResult: {"totalAmount": 1500.0, "transactionTypeCounter": 26878, "totalCounter": 76722, "invoiceCounterExtension": "ПП", "invoiceNumber": "VBMHX9SX-W6UBPZO0-76722", "signedBy": "W6UBPZO0", "sdcTime": "2023-01-03T10:15:33.93Z"},
  journal: `============ ФИСКАЛНИ РАЧУН ============
               112392483                
     RESTAURANT PLEASURE PARK ČAIR      
       1207756-PLEASURE PARK ČAIR       
          ИX БРИГАДЕ 27 Л1              
              Ниш-Медијана              
Касир:                        Operater 1
ЕСИР број:                       868/5.0
-------------ПРОМЕТ ПРОДАЈА-------------
Артикли
========================================
Назив   Цена         Кол.         Укупно
Burito sa piletinom (Ђ)                 
       650,00          1          650,00
Grcki omlet (Ђ)                         
       490,00          1          490,00
Elixir mix 0.33l (Ђ)                    
       360,00          1          360,00
----------------------------------------
Укупан износ:                   1.500,00
Готовина:                       1.500,00
========================================
Ознака       Име      Стопа        Порез
Ђ           О-ПДВ   20,00%        250,00
----------------------------------------
Укупан износ пореза:              250,00
========================================
ПФР време:          03.01.2023. 11:15:33
ПФР број рачуна: VBMHX9SX-W6UBPZO0-76722
Бројач рачуна:             26878/76722ПП
========================================
======== КРАЈ ФИСКАЛНОГ РАЧУНА =========`,
};

const MLEKARICA = {
  invoiceRequest: {"posTime": null, "taxId": "110867582", "businessName": "MLEKARICA MILK", "locationName": "1016227-MLEKARICA MILK Milunka Trifunović Pr", "address": "Књажевачка ББ Пијаца Башта лок 43   ", "city": "НИШ (ПАНТЕЛЕЈ)", "administrativeUnit": "Ниш-Пантелеј", "buyer": null, "buyerCostCenter": null, "cashier": "Mlekarica Milk", "requestedBy": "JJ4UYMRF", "referentDocumentNumber": null, "invoiceType": 0, "transactionType": 0, "payments": [{"paymentType": 1, "amount": 1150.0}]},
  invoiceResult: {"totalAmount": 1150.0, "transactionTypeCounter": 7013, "totalCounter": 7027, "invoiceCounterExtension": "ПП", "invoiceNumber": "JJ4UYMRF-JJ4UYMRF-7027", "signedBy": "JJ4UYMRF", "sdcTime": "2024-01-28T09:58:50.097Z"},
  journal: `============ ФИСКАЛНИ РАЧУН ============
               110867582                
             MLEKARICA MILK             
     1016227-MLEKARICA MILK Milunka     
             Trifunović Pr              
  Књажевачка ББ Пијаца Башта лок 43     
              Ниш-Пантелеј              
Касир:                    Mlekarica Milk
ЕСИР број:                       245/1.0
-------------ПРОМЕТ ПРОДАЈА-------------
Артикли
========================================
Назив   Цена         Кол.         Укупно
Kore (kom) (А)                          
       120,00          1          120,00
Heljdine kore (kom) (А)                 
       180,00          1          180,00
Kantica jastrebacki (kom) (А)           
       850,00          1          850,00
----------------------------------------
Укупан износ:                   1.150,00
Готовина:                       1.150,00
========================================
Ознака       Име      Стопа        Порез
А      Није у ПДВ    0,00%          0,00
----------------------------------------
Укупан износ пореза:                0,00
========================================
ПФР време:          28.01.2024. 10:58:50
ПФР број рачуна:  JJ4UYMRF-JJ4UYMRF-7027
Бројач рачуна:               7013/7027ПП
========================================
======== КРАЈ ФИСКАЛНОГ РАЧУНА =========`,
};

const STAMPA = {
  invoiceRequest: {"posTime": null, "taxId": "103915893", "businessName": "ŠTAMPA SISTEM DOO BEOGRAD", "locationName": "1209768-NI148", "address": "Ул.Обреновићева (према ул. Николе Пашића) на простору између ТЦ Калча и улаза у подземни пролаз    ", "city": "НИШ (МЕДИЈАНА)", "administrativeUnit": "Ниш-Медијана", "buyer": null, "buyerCostCenter": null, "cashier": "21129", "requestedBy": "JFN2J6JQ", "referentDocumentNumber": null, "invoiceType": 0, "transactionType": 0, "payments": [{"paymentType": 1, "amount": 65.0}]},
  invoiceResult: {"totalAmount": 65.0, "transactionTypeCounter": 50760, "totalCounter": 50964, "invoiceCounterExtension": "ПП", "invoiceNumber": "JFN2J6JQ-JFN2J6JQ-50964", "signedBy": "JFN2J6JQ", "sdcTime": "2023-03-25T14:32:42.038Z"},
  journal: `============ ФИСКАЛНИ РАЧУН ============
               103915893                
       ŠTAMPA SISTEM DOO BEOGRAD        
             1209768-NI148              
   Ул.Обреновићева (према ул. Николе    
 Пашића) на простору између ТЦ Калча и  
        улаза у подземни пролаз         
              Ниш-Медијана              
Касир:                             21129
ЕСИР број:                     315/1.0.0
-------------ПРОМЕТ ПРОДАЈА-------------
Артикли
========================================
Назив   Цена         Кол.         Укупно
VODA AQUA VIVA KNJAZ 0,5L 24/KOM (Ђ)    
        65,00          1           65,00
----------------------------------------
Укупан износ:                      65,00
Готовина:                          65,00
========================================
Ознака       Име      Стопа        Порез
Ђ           О-ПДВ   20,00%         10,83
----------------------------------------
Укупан износ пореза:               10,83
========================================
ПФР време:          25.03.2023. 15:32:42
ПФР број рачуна: JFN2J6JQ-JFN2J6JQ-50964
Бројач рачуна:             50760/50964ПП
========================================
======== КРАЈ ФИСКАЛНОГ РАЧУНА =========`,
};


/**
 * A receipt built by hand, for the shapes the three real ones do not have.
 *
 * Only the two section rules and the column heading matter to the parser, so this is the
 * smallest thing that is still a receipt as far as it is concerned.
 */
const slip = (lines: string, time = "ПФР време:          12.09.2026. 18:42:31") =>
  [
    "============ ФИСКАЛНИ РАЧУН ============",
    "Артикли",
    "=".repeat(40),
    "Назив   Цена         Кол.         Укупно",
    lines,
    "-".repeat(40),
    "Укупан износ:                   1.000,00",
    "=".repeat(40),
    "Ознака       Име      Стопа        Порез",
    "=".repeat(40),
    time,
    "=".repeat(40),
    "======== КРАЈ ФИСКАЛНОГ РАЧУНА =========",
  ].join("\n");

describe("receiptToken", () => {
  const real =
    "https://suf.purs.gov.rs/v/?vl=A1ZCTUhYOVNYVzZVQlBaTzCyKwEA%2FmgAAMDh5AAAAAAAAAABhXchESoAAAAP";

  it("takes the payload out of a scanned address", () => {
    expect(receiptToken(real)).toBe("A1ZCTUhYOVNYVzZVQlBaTzCyKwEA/mgAAMDh5AAAAAAAAAABhXchESoAAAAP");
  });

  /*
    The whole reason this function exists. Everything below is an address that a person
    could be handed — printed on a fake slip, pasted into a chat — and that the server
    must not be talked into fetching on their behalf.
  */
  it("refuses any host but the tax service's own", () => {
    expect(receiptToken("https://suf.purs.gov.rs.evil.com/v/?vl=abc")).toBeNull();
    expect(receiptToken("https://notsuf.purs.gov.rs/v/?vl=abc")).toBeNull();
    expect(receiptToken("https://evil.com/v/?vl=abc")).toBeNull();
    expect(receiptToken("https://evil.com/?a=suf.purs.gov.rs&vl=abc")).toBeNull();
  });

  it("is not fooled by a host written into the user info", () => {
    expect(receiptToken("https://suf.purs.gov.rs@evil.com/v/?vl=abc")).toBeNull();
    expect(receiptToken("https://user:pass@suf.purs.gov.rs/v/?vl=abc")).toBeNull();
  });

  it("will not be pointed at the machine it is running on", () => {
    expect(receiptToken("http://127.0.0.1/v/?vl=abc")).toBeNull();
    expect(receiptToken("http://localhost:3000/v/?vl=abc")).toBeNull();
    expect(receiptToken("http://169.254.169.254/latest/meta-data?vl=abc")).toBeNull();
    expect(receiptToken("http://[::1]/v/?vl=abc")).toBeNull();
  });

  it("only understands http addresses", () => {
    expect(receiptToken("file:///etc/passwd")).toBeNull();
    expect(receiptToken("javascript:alert(1)")).toBeNull();
    expect(receiptToken("data:text/html,<script>")).toBeNull();
    expect(receiptToken("not a url at all")).toBeNull();
    expect(receiptToken("")).toBeNull();
  });

  it("wants a payload, and one that looks like one", () => {
    expect(receiptToken("https://suf.purs.gov.rs/v/")).toBeNull();
    expect(receiptToken("https://suf.purs.gov.rs/v/?vl=")).toBeNull();
    expect(receiptToken("https://suf.purs.gov.rs/v/?vl=<script>")).toBeNull();
    expect(receiptToken("https://suf.purs.gov.rs/v/?vl=a b")).toBeNull();
    expect(receiptToken(`https://suf.purs.gov.rs/v/?vl=${"A".repeat(5000)}`)).toBeNull();
  });

  /*
    The address that leaves is built, not passed on — so a port, a path, a fragment and a
    second parameter cannot ride along even when the host is the right one.
  */
  it("throws away everything but the payload", () => {
    const token = receiptToken("http://suf.purs.gov.rs:8080/v/../admin?vl=abc123&next=http://evil.com#x");
    expect(token).toBe("abc123");
    expect(receiptUrl(token as string)).toBe("https://suf.purs.gov.rs/v/?vl=abc123");
  });
});

describe("readReceipt", () => {
  it("reads three plates in a restaurant", () => {
    const read = readReceipt(PLEASURE_PARK);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.receipt.store).toBe("RESTAURANT PLEASURE PARK ČAIR");
    expect(read.receipt.boughtOn).toBe("2023-01-03");
    expect(read.receipt.total).toBe(1500);
    expect(read.receipt.number).toBe("VBMHX9SX-W6UBPZO0-76722");
    expect(read.receipt.items).toEqual([
      { name: "Burito sa piletinom", qty: 1, amount: 650 },
      { name: "Grcki omlet", qty: 1, amount: 490 },
      { name: "Elixir mix 0.33l", qty: 1, amount: 360 },
    ]);
    expect(read.receipt.balanced).toBe(true);
    expect(read.receipt.notes).toEqual([]);
  });

  it("takes the unit off a name and leaves the name alone", () => {
    const read = readReceipt(MLEKARICA);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.receipt.items.map((i) => i.name)).toEqual([
      "Kore",
      "Heljdine kore",
      "Kantica jastrebacki",
    ]);
    expect(read.receipt.total).toBe(1150);
    expect(read.receipt.balanced).toBe(true);
  });

  /*
    `24/KOM` is how a case of water is sold, not how it is measured. A rule clever enough
    to strip it is a rule that will one day strip a size or a flavour, so the only thing
    taken off the end of a name is a unit the printer put in its own brackets.
  */
  it("keeps a pack size that only looks like a unit", () => {
    const read = readReceipt(STAMPA);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.receipt.items).toEqual([
      { name: "VODA AQUA VIVA KNJAZ 0,5L 24/KOM", qty: 1, amount: 65 },
    ]);
    expect(read.receipt.store).toBe("ŠTAMPA SISTEM DOO BEOGRAD");
    expect(read.receipt.boughtOn).toBe("2023-03-25");
  });

  it("refuses anything that is not an ordinary sale", () => {
    const refund = { ...PLEASURE_PARK, invoiceRequest: { ...PLEASURE_PARK.invoiceRequest, transactionType: 1 } };
    const copy = { ...PLEASURE_PARK, invoiceRequest: { ...PLEASURE_PARK.invoiceRequest, invoiceType: 2 } };
    const training = { ...PLEASURE_PARK, invoiceRequest: { ...PLEASURE_PARK.invoiceRequest, invoiceType: 3 } };
    const proforma = { ...PLEASURE_PARK, invoiceRequest: { ...PLEASURE_PARK.invoiceRequest, invoiceType: 1 } };

    for (const bad of [refund, copy, training, proforma]) {
      const read = readReceipt(bad);
      expect(read.ok).toBe(false);
    }
  });

  it("says so rather than guessing when the answer is not a receipt", () => {
    expect(readReceipt(null).ok).toBe(false);
    expect(readReceipt("<html>").ok).toBe(false);
    expect(readReceipt({ invoiceRequest: {}, invoiceResult: {} }).ok).toBe(false);
    expect(readReceipt({ ...PLEASURE_PARK, invoiceResult: { ...PLEASURE_PARK.invoiceResult, totalAmount: 0 } }).ok).toBe(false);
  });
});

describe("journalItems", () => {
  it("does not read the column heading as the first thing bought", () => {
    const { items } = journalItems(slip(["Mleko (Ђ)", "       120,00          2          240,00"].join("\n")));
    expect(items).toEqual([{ name: "Mleko", qty: 2, amount: 120 }]);
  });

  it("joins a name that ran over two lines", () => {
    const { items } = journalItems(
      slip(
        [
          "NIVEA MEN SILVER PROTECT deo stick 50ml",
          "  za osetljivu kozu (Ђ)",
          "       599,99          1          599,99",
        ].join("\n"),
      ),
    );
    expect(items).toEqual([
      { name: "NIVEA MEN SILVER PROTECT deo stick 50ml za osetljivu kozu", qty: 1, amount: 599.99 },
    ]);
  });

  /*
    Four hundred and twelve grams of peppers is not four hundred and twelve peppers. The
    entry's list counts whole things and multiplies, so a weighed line is folded into one
    line at what it actually cost, with the weight kept where it can be read. The sum is
    the thing being protected: a list that does not add up to the receipt is a list that
    cannot be used to check the receipt.
  */
  it("folds a weighed line instead of multiplying it", () => {
    const { items } = journalItems(
      slip(["Paprika babura/kg (Ђ)", "       219,99          0,412         90,64"].join("\n")),
    );
    expect(items).toEqual([{ name: "Paprika babura/kg (0,412)", qty: 1, amount: 90.64 }]);
    expect(items[0].qty * items[0].amount).toBeCloseTo(90.64, 2);
  });

  it("trusts what the line was charged over what it should have been", () => {
    // A discount applied to the line: two at a hundred, charged two hundred and fifty.
    const { items } = journalItems(
      slip(["Kafa 3 u 1 (Ђ)", "       100,00          2          250,00"].join("\n")),
    );
    expect(items).toEqual([{ name: "Kafa 3 u 1 (2)", qty: 1, amount: 250 }]);
  });

  it("reads thousands and para the way the printer writes them", () => {
    const { items } = journalItems(
      slip(["Frizider (Ђ)", "    45.999,50          1       45.999,50"].join("\n")),
    );
    expect(items).toEqual([{ name: "Frizider", qty: 1, amount: 45999.5 }]);
  });

  it("stops at the entry's own limit and says how many were left", () => {
    const line = (n: number) => `Stvar ${n} (Ђ)\n        10,00          1           10,00`;
    const many = Array.from({ length: 65 }, (_, i) => line(i + 1)).join("\n");
    const { items, dropped } = journalItems(slip(many));
    expect(items).toHaveLength(60);
    expect(dropped).toBe(5);
  });

  it("does not mistake the payment summary for an item", () => {
    const { items } = journalItems(slip(["Mleko (Ђ)", "       120,00          1          120,00"].join("\n")));
    expect(items).toHaveLength(1);
  });

  it("finds nothing in something that is not a receipt", () => {
    expect(journalItems("").items).toEqual([]);
    expect(journalItems("nothing here").items).toEqual([]);
  });
});

describe("receiptDay", () => {
  it("takes the day the shop printed", () => {
    expect(receiptDay(slip("", "ПФР време:          03.01.2023. 11:15:33"), null)).toBe("2023-01-03");
  });

  /*
    The signed stamp is in UTC, and Belgrade is an hour or two ahead of it — so a receipt
    from half past eleven at night is dated the day before if the stamp is merely sliced.
  */
  it("converts the signed stamp to the Belgrade day when nothing was printed", () => {
    expect(receiptDay("no time here", "2026-09-12T22:30:00Z")).toBe("2026-09-13");
    expect(receiptDay("no time here", "2026-01-12T22:30:00Z")).toBe("2026-01-12");
    expect(receiptDay("no time here", "rubbish")).toBe("");
  });
});

