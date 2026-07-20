import { request } from './client'
import type { Person } from './clients'

export interface CreatePersonBody {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Person['gender']
  relationToInsured: Person['relationToInsured']
  maritalStatus?: Person['maritalStatus']
}

export type UpdatePersonBody = Partial<CreatePersonBody>

export function createPerson(body: CreatePersonBody): Promise<Person> {
  return request('/persons', { method: 'POST', body: JSON.stringify(body) })
}

export function updatePerson(id: number, body: UpdatePersonBody): Promise<Person> {
  return request(`/persons/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
