import {createFormalHandler} from './formal-handler'
// Release only after the restricted real-media check succeeds.
Deno.serve(createFormalHandler(Object.freeze({writes:true,uploads:true,publication:false})))
