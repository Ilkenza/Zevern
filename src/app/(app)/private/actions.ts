/**
 * Every money action, at the address the whole app already imports them from.
 *
 * The file behind this was 2,617 lines: transactions, accounts, categories, budgets,
 * goals, rules, debts, planned items, rates and colours, one after another, separated by
 * comment rules. Those rules are files now. This stays because twenty-nine screens import
 * from here and none of them should have to know which of the ten a given action lives
 * in — and because a re-export keeps every action's identity where it is defined, which
 * is what a server action is addressed by.
 *
 * Not a `"use server"` file itself: a plain module that re-exports them, so the type below
 * can travel with them.
 */

export type { MoneyState } from "./actions/shared";
export * from "./actions/transactions";
export * from "./actions/accounts";
export * from "./actions/categories";
export * from "./actions/budgets";
export * from "./actions/goals";
export * from "./actions/items";
export * from "./actions/recurring";
export * from "./actions/planned";
export * from "./actions/settings";
export * from "./actions/reads";

