// OFF candidate entry retained for rollback and local preparation.
import { createFormalHandler } from './formal-handler'
Deno.serve(createFormalHandler())
