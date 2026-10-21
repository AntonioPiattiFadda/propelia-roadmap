import type { Tables } from '@/types/database.types'

/** Una reunión del CRM (`crm_meetings`): lo que en el producto es una visita. */
export type Meeting = Tables<'crm_meetings'>
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled'
