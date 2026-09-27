export interface ImageLightboxState {
  isOpen: boolean
}

export type ImageLightboxAction = { type: 'open' } | { type: 'close' }

export const CLOSED_IMAGE_LIGHTBOX: ImageLightboxState = { isOpen: false }

export function reduceImageLightbox(
  state: ImageLightboxState,
  action: ImageLightboxAction
): ImageLightboxState {
  if (action.type === 'open') return state.isOpen ? state : { isOpen: true }
  return state.isOpen ? CLOSED_IMAGE_LIGHTBOX : state
}
