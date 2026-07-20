export const DEFAULT_WHATSAPP_NUMBER = '60109639228'
export const DEFAULT_WHATSAPP_MESSAGE = '你好，我们从 JnQ Journey 网站看到你们，想咨询旅游配套或行程。'

export type WhatsAppPageType = 'home' | 'region' | 'spot' | 'guide' | 'package' | 'note' | 'contact'

interface WhatsAppUrlOptions {
  phone?: string
  message?: string
  source?: string
  pageType?: WhatsAppPageType
  region?: string
  spotName?: string
  guideTitle?: string
  packageName?: string
}

function cleanPhone(value?: string) {
  return String(value || DEFAULT_WHATSAPP_NUMBER).replace(/\D/g, '') || DEFAULT_WHATSAPP_NUMBER
}

export function buildWhatsAppMessage(options: WhatsAppUrlOptions = {}) {
  if (options.message?.trim()) return options.message.trim()

  const details =
    options.pageType === 'region' && options.region
      ? `你好，我们从 JnQ Journey 的${options.region}旅游页面看到你们，想了解当地旅游配套。\n\n预计日期：\n人数：\n出发码头：\n其他要求：`
      : options.pageType === 'spot' && options.spotName
        ? `你好，我正在查看 JnQ Journey 的「${options.spotName}」介绍，想了解相关行程或旅游配套。\n\n预计日期：\n人数：\n其他要求：`
        : options.pageType === 'guide' && options.guideTitle
          ? `你好，我看了 JnQ Journey 的「${options.guideTitle}」，想咨询类似路线或旅游配套。\n\n预计日期：\n人数：\n其他要求：`
          : options.pageType === 'package' && options.packageName
            ? `你好，我从 JnQ Journey 看到「${options.packageName}」，想查询最新价格和可出发日期。\n\n预计日期：\n成人：\n儿童：\n出发码头：\n房间数量：`
            : DEFAULT_WHATSAPP_MESSAGE

  return options.source ? `${details}\n\n来源：${options.source}` : details
}

export function buildWhatsAppUrl(options: WhatsAppUrlOptions = {}) {
  const phone = cleanPhone(options.phone || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(options))}`
}
