import { readLocalizationSnapshot } from './localization-snapshot'
import { applyLocalization, localizationRecord, type EntityType } from '@/lib/localization'
import { localizedAlternates } from '@/lib/localized-metadata'

export async function chineseLocalizedAlternates(path:string,type:EntityType,id:string|number,source:unknown) {
  const snapshot=await readLocalizationSnapshot('en')
  const result=applyLocalization(source,localizationRecord(snapshot,type,id))
  return localizedAlternates(path,'zh',result.status)
}
