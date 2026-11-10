import config from './pilot-config.json' with {type:'json'}
import {createSaveHandler} from './save-handler.mjs'
Deno.serve(createSaveHandler({config,env:(name:string)=>Deno.env.get(name)}))
