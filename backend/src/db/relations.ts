import { relations } from "drizzle-orm"
import {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  drivers,
  persons,
  policyDrivers,
  policyLogs,
  sessions,
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
