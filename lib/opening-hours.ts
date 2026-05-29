interface ScheduleGroup {
  label: string
  hours: string
}

interface FormattedOpeningHours {
  visible: boolean
  isUnknown: boolean
  primary: string
  statusLabel: string
  statusTone: 'open' | 'closed' | 'unknown'
  closedDaysLabel: string
  groupedHours: ScheduleGroup[]
  remarks: string
  plainText: string
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DAY_NAME_MAP: Record<string, string> = {
  sunday: '周日',
  sun: '周日',
  monday: '周一',
  mon: '周一',
  tuesday: '周二',
  tue: '周二',
  wednesday: '周三',
  wed: '周三',
  thursday: '周四',
  thu: '周四',
  friday: '周五',
  fri: '周五',
  saturday: '周六',
  sat: '周六',
}

function formatDay(value: unknown) {
  if (typeof value === 'number' && DAY_LABELS[value]) return DAY_LABELS[value]
  const text = String(value || '').trim()
  const normalized = text.toLowerCase()
  return DAY_NAME_MAP[normalized] || text
}

function formatGroupedHoursLabel(days: number[]) {
  if (!Array.isArray(days) || !days.length) return ''
  const labels = days.map((day) => DAY_LABELS[day]).filter(Boolean)
  if (labels.length === 1) return labels[0]
  const isConsecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1)
  return isConsecutive ? `${DAY_LABELS[days[0]]}-${DAY_LABELS[days[days.length - 1]]}` : labels.join('、')
}

function looksLikeUnknownHours(value: string) {
  return /^no information$/i.test(value) || /^unknown$/i.test(value) || value === '未知' || value === '暂无'
}

function isStructuredHours(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function formatOpeningHoursDisplay(value?: string | null): FormattedOpeningHours {
  const raw = String(value || '').trim()
  const fallback: FormattedOpeningHours = {
    visible: Boolean(raw) && !looksLikeUnknownHours(raw),
    isUnknown: false,
    primary: raw,
    statusLabel: '',
    statusTone: 'open',
    closedDaysLabel: '',
    groupedHours: [],
    remarks: '',
    plainText: raw,
  }

  if (!raw || looksLikeUnknownHours(raw)) return { ...fallback, visible: false, isUnknown: true }

  try {
    const data = JSON.parse(raw)
    if (!isStructuredHours(data)) return fallback

    if (data.isUnknown) {
      const remarks = String(data.remarks || '').trim()
      return {
        visible: false,
        isUnknown: true,
        primary: '营业时间待确认',
        statusLabel: '待确认',
        statusTone: 'unknown',
        closedDaysLabel: '',
        groupedHours: [],
        remarks,
        plainText: remarks ? `营业时间待确认\n${remarks}` : '营业时间待确认',
      }
    }

    const groupedHours = Array.isArray(data.scheduleGroups)
      ? data.scheduleGroups
          .map((group: any) => ({
            label: String(group.label || formatGroupedHoursLabel(Array.isArray(group.days) ? group.days : [])).trim(),
            hours: String(group.hours || '').trim(),
          }))
          .filter((group: ScheduleGroup) => group.label && group.hours)
      : []

    const legacyDayGroups = Object.entries(data)
      .filter(([key, item]) => DAY_NAME_MAP[key.toLowerCase()] && typeof item === 'string' && String(item).trim())
      .map(([key, item]) => ({
        label: formatDay(key),
        hours: String(item).trim(),
      }))

    const remarks = String(data.remarks || '').trim()
    const recurringHours = remarks.startsWith('营业时段：') ? remarks.replace(/^营业时段：/, '').trim() : ''
    const open = String(data.open || '').trim()
    const close = String(data.close || '').trim()
    const primary = data.is24Hours
      ? '24 小时营业'
      : recurringHours || (open && close ? `${open} - ${close}` : groupedHours[0]?.hours || legacyDayGroups[0]?.hours || remarks || '营业时间待确认')

    const closedDays = Array.isArray(data.closedDays)
      ? data.closedDays.map(formatDay).filter(Boolean)
      : []
    const closedDaysLabel = closedDays.join('、')
    const hoursGroups = groupedHours.length ? groupedHours : legacyDayGroups
    const visibleRemarks = remarks && remarks !== primary && !remarks.startsWith('营业时段：') ? remarks : ''

    return {
      visible: Boolean(primary),
      isUnknown: false,
      primary,
      statusLabel: closedDaysLabel ? `休息：${closedDaysLabel}` : '每日开放',
      statusTone: closedDaysLabel ? 'closed' : 'open',
      closedDaysLabel,
      groupedHours: hoursGroups,
      remarks: visibleRemarks,
      plainText: [primary, closedDaysLabel ? `休息：${closedDaysLabel}` : '', ...hoursGroups.map((group) => `${group.label} ${group.hours}`), visibleRemarks]
        .filter(Boolean)
        .join('\n'),
    }
  } catch {
    return fallback
  }
}

export function hasVisibleOpeningHours(value?: string | null) {
  return formatOpeningHoursDisplay(value).visible
}
