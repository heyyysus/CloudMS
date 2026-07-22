import { relations } from "drizzle-orm"
import {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  drivers,
  invoiceItems,
  invoices,
  payments,
  persons,
  policyDrivers,
  policyLogs,
  receipts,
  sessions,
  trustLedger,
  users,
  vehicles,
} from "./schema"

export const personsRelations = relations(persons, ({ one, many }) => ({
  driver: one(drivers),
  namedInsuredFor: many(clients, { relationName: "namedInsured" }),
  secondNamedInsuredFor: many(clients, { relationName: "secondNamedInsured" }),
}))

export const driversRelations = relations(drivers, ({ one, many }) => ({
  person: one(persons, { fields: [drivers.personId], references: [persons.id] }),
  policyDrivers: many(policyDrivers),
}))

export const clientsRelations = relations(clients, ({ one, many }) => ({
  namedInsured: one(persons, {
    fields: [clients.namedInsuredId],
    references: [persons.id],
    relationName: "namedInsured",
  }),
  secondNamedInsured: one(persons, {
    fields: [clients.secondNamedInsuredId],
    references: [persons.id],
    relationName: "secondNamedInsured",
  }),
  phones: many(clientPhones),
  emails: many(clientEmails),
  policies: many(autoPolicies),
}))

export const clientPhonesRelations = relations(clientPhones, ({ one }) => ({
  client: one(clients, { fields: [clientPhones.clientId], references: [clients.id] }),
}))

export const clientEmailsRelations = relations(clientEmails, ({ one }) => ({
  client: one(clients, { fields: [clientEmails.clientId], references: [clients.id] }),
}))

export const carriersRelations = relations(carriers, ({ many }) => ({
  policies: many(autoPolicies),
}))

export const autoPoliciesRelations = relations(autoPolicies, ({ one, many }) => ({
  client: one(clients, { fields: [autoPolicies.clientId], references: [clients.id] }),
  carrier: one(carriers, { fields: [autoPolicies.carrierId], references: [carriers.id] }),
  vehicles: many(vehicles),
  policyDrivers: many(policyDrivers),
  logs: many(policyLogs),
  invoices: many(invoices),
  payments: many(payments),
  receipts: many(receipts),
  trustLedger: many(trustLedger),
}))

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  policy: one(autoPolicies, { fields: [invoices.policyId], references: [autoPolicies.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  createdByUser: one(users, { fields: [invoices.createdBy], references: [users.id] }),
  items: many(invoiceItems),
  payments: many(payments),
  receipts: many(receipts),
}))

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  carrier: one(carriers, { fields: [invoiceItems.carrierId], references: [carriers.id] }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  receipt: one(receipts, { fields: [payments.id], references: [receipts.paymentId] }),
  createdByUser: one(users, { fields: [payments.createdBy], references: [users.id] }),
}))

export const receiptsRelations = relations(receipts, ({ one }) => ({
  payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [receipts.invoiceId], references: [invoices.id] }),
  createdByUser: one(users, { fields: [receipts.createdBy], references: [users.id] }),
}))

export const trustLedgerRelations = relations(trustLedger, ({ one }) => ({
  policy: one(autoPolicies, { fields: [trustLedger.policyId], references: [autoPolicies.id] }),
  client: one(clients, { fields: [trustLedger.clientId], references: [clients.id] }),
  invoice: one(invoices, { fields: [trustLedger.invoiceId], references: [invoices.id] }),
  payment: one(payments, { fields: [trustLedger.paymentId], references: [payments.id] }),
  invoiceItem: one(invoiceItems, {
    fields: [trustLedger.invoiceItemId],
    references: [invoiceItems.id],
  }),
  carrier: one(carriers, { fields: [trustLedger.carrierId], references: [carriers.id] }),
}))

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  policy: one(autoPolicies, { fields: [vehicles.policyId], references: [autoPolicies.id] }),
}))

export const policyDriversRelations = relations(policyDrivers, ({ one }) => ({
  policy: one(autoPolicies, { fields: [policyDrivers.policyId], references: [autoPolicies.id] }),
  driver: one(drivers, { fields: [policyDrivers.driverId], references: [drivers.id] }),
}))

export const policyLogsRelations = relations(policyLogs, ({ one }) => ({
  policy: one(autoPolicies, { fields: [policyLogs.policyId], references: [autoPolicies.id] }),
  author: one(users, { fields: [policyLogs.authorId], references: [users.id] }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  policyLogs: many(policyLogs),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))
