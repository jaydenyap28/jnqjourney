'use client'
let capabilities = { writesEnabled: false, uploadsEnabled: false, publishingEnabled: false }
export const formalCanWrite = () => capabilities.writesEnabled
export const formalCanUpload = () => capabilities.uploadsEnabled
export const formalCanPublish = () => capabilities.publishingEnabled
export function setFormalCapabilities(value: Record<string, unknown>) {
  capabilities = { writesEnabled: value.writesEnabled === true, uploadsEnabled: value.uploadsEnabled === true,
    publishingEnabled: value.publishingEnabled === true }
}
