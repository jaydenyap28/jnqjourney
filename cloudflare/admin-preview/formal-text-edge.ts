// User-authorized phase 1 only. No media upload or publication capability.
import { createFormalHandler } from './formal-handler'
Deno.serve(createFormalHandler(Object.freeze({ writes: true, uploads: false, publication: false })))
