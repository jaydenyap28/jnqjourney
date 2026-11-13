import { createFormalHandler } from './formal-handler'
// Opens explicit administrator queue admission only. Runner calls require an
// independent server-side execution approval that remains OFF for preparation.
Deno.serve(createFormalHandler({ writes: true, uploads: true, publication: true }))
